from fastapi import FastAPI

app = FastAPI(title="Cube Timer API")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
