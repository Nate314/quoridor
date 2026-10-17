import Faq from './components/Faq'
import Game from './components/Game'
import ThemeToggle from './components/ThemeToggle'
import './App.css'

function App() {
  return (
    <div className="app">
      <ThemeToggle />
      <Faq />
      <h1>Quoridor</h1>
      <Game />
    </div>
  )
}

export default App
