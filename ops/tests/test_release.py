"""Exercise the release helper against disposable local Git repositories."""

import os
from pathlib import Path
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "release.sh"


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.remote = self.root / "remote.git"
        self.repo = self.root / "checkout"
        # Ignore developer signing, hooks, identity, and other Git configuration.
        self.env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
        self.env.update({
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_CONFIG_GLOBAL": os.devnull,
            "GIT_TERMINAL_PROMPT": "0",
            "GIT_AUTHOR_NAME": "Release Test",
            "GIT_AUTHOR_EMAIL": "release@example.test",
            "GIT_COMMITTER_NAME": "Release Test",
            "GIT_COMMITTER_EMAIL": "release@example.test",
        })
        self.git("init", "--bare", str(self.remote), cwd=self.root)
        self.git("init", "--initial-branch=master", str(self.repo), cwd=self.root)
        self.git("remote", "add", "origin", str(self.remote))
        (self.repo / "tracked.txt").write_text("initial\n")
        self.git("add", ".")
        self.git("commit", "-m", "Initial commit")
        self.git("tag", "-a", "v0.1.3", "-m", "Initial release")
        self.git("commit", "--allow-empty", "-m", "A useful improvement")
        self.git("push", "--tags", "origin", "master")

    def git(self, *args, cwd=None):
        return subprocess.run(
            ["git", *args], cwd=cwd or self.repo, env=self.env,
            text=True, capture_output=True, check=True,
        ).stdout.strip()

    def release(self, *args, answer="y\n"):
        return subprocess.run(
            ["bash", str(SCRIPT), *args], cwd=self.repo, env=self.env,
            input=answer, text=True, capture_output=True, timeout=15,
        )

    def assert_rejected(self, message, *args):
        local_tags = self.git("tag", "--list")
        remote_tags = self.git("--git-dir", str(self.remote), "tag", "--list")
        result = self.release(*args)
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn(message, result.stderr)
        self.assertEqual(self.git("tag", "--list"), local_tags)
        self.assertEqual(self.git("--git-dir", str(self.remote), "tag", "--list"), remote_tags)

    def test_default_patch_creates_and_pushes_annotated_tag(self):
        sha = self.git("rev-parse", "HEAD")
        result = self.release()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("A useful improvement", result.stdout)
        self.assertIn("Release v0.1.4 from master", result.stdout)
        self.assertEqual(self.git("cat-file", "-t", "v0.1.4"), "tag")
        self.assertEqual(self.git("rev-parse", "v0.1.4^{}"), sha)
        self.assertEqual(self.git("--git-dir", str(self.remote), "rev-parse", "v0.1.4^{}"), sha)
        self.assertEqual(self.git("--git-dir", str(self.remote), "rev-parse", "master"), sha)

    def test_minor_resets_patch(self):
        result = self.release("minor")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("v0.2.0", self.git("tag", "--list"))

    def test_major_resets_minor_and_patch(self):
        result = self.release("major", answer="Yes\n")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("v1.0.0", self.git("tag", "--list"))

    def test_fetches_tags_and_uses_numeric_stable_version_order(self):
        for tag in ("v0.1.9", "v0.1.10", "v99.0.0-rc.1", "v98.0", "unrelated"):
            self.git("tag", tag)
            self.git("push", "origin", f"refs/tags/{tag}")
            self.git("tag", "-d", tag)
        result = self.release("patch")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("v0.1.11", self.git("tag", "--list"))

    def test_cancel_and_eof_create_no_tags(self):
        for answer in ("n\n", "\n", "", "sure\n"):
            with self.subTest(answer=answer):
                result = self.release(answer=answer)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn("cancelled", result.stdout)
                self.assertEqual(self.git("tag", "--list"), "v0.1.3")
                self.assertEqual(self.git("--git-dir", str(self.remote), "tag", "--list"), "v0.1.3")

    def test_rejects_invalid_arguments(self):
        self.assert_rejected("usage:", "automatic")
        self.assert_rejected("usage:", "patch", "extra")

    def test_rejects_wrong_branch(self):
        self.git("switch", "-c", "feature")
        self.assert_rejected("switch to master")

    def test_rejects_detached_head(self):
        self.git("checkout", "--detach")
        self.assert_rejected("switch to master")

    def test_rejects_untracked_files(self):
        (self.repo / "untracked.txt").write_text("not committed")
        self.assert_rejected("working tree must be clean")

    def test_rejects_tracked_changes(self):
        (self.repo / "tracked.txt").write_text("changed")
        self.assert_rejected("working tree must be clean")
        self.git("add", "tracked.txt")
        self.assert_rejected("working tree must be clean")

    def test_rejects_unpushed_commits(self):
        self.git("commit", "--allow-empty", "-m", "Unpushed")
        self.assert_rejected("master must match origin/master")

    def test_rejects_outdated_master(self):
        self.git("reset", "--hard", "HEAD~1")
        self.assert_rejected("master must match origin/master")

    def test_rejects_missing_stable_tag(self):
        self.git("push", "origin", ":refs/tags/v0.1.3")
        self.git("tag", "-d", "v0.1.3")
        self.assert_rejected("no stable vX.Y.Z tag found")

    def test_rejects_release_tag_outside_master_history(self):
        self.git("switch", "-c", "other")
        self.git("commit", "--allow-empty", "-m", "Other branch")
        self.git("tag", "v0.2.0")
        self.git("push", "origin", "refs/tags/v0.2.0")
        self.git("switch", "master")
        self.assert_rejected("not in master's history")

    def test_push_failure_keeps_local_tag_and_explains_recovery(self):
        hook = self.remote / "hooks" / "pre-receive"
        hook.write_text("#!/bin/sh\nexit 1\n")
        hook.chmod(0o755)
        result = self.release()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("local tag v0.1.4 was kept", result.stderr)
        self.assertIn("v0.1.4", self.git("tag", "--list"))
        self.assertEqual(self.git("--git-dir", str(self.remote), "tag", "--list"), "v0.1.3")


if __name__ == "__main__":
    unittest.main()
