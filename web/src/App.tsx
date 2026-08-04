import { useEffect, useState } from 'react'
import './App.css'

function App() {
  const [apiStatus, setApiStatus] = useState('checking')

  useEffect(() => {
    fetch('/api/health')
      .then((response) => {
        if (!response.ok) throw new Error('API unavailable')
        return response.json() as Promise<{ status: string }>
      })
      .then(({ status }) => setApiStatus(status))
      .catch(() => setApiStatus('offline'))
  }, [])

  return (
    <main>
      <header>
        <span className="mark">CT</span>
        <span>cube timer</span>
      </header>
      <section className="welcome">
        <p className="eyebrow">3x3 / free practice</p>
        <h1>Ready when you are.</h1>
        <p>The timer workspace is being prepared.</p>
      </section>
      <footer>
        <span
          className={`status status--${apiStatus}`}
          aria-label={`API ${apiStatus}`}
        />
        api {apiStatus}
      </footer>
    </main>
  )
}

export default App
