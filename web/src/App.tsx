import { GhostChat } from "./components/GhostChat.js"
import { Timeline } from "./components/Timeline.js"

export const App = () => (
  <main className="mx-auto grid max-w-6xl gap-6 p-6 lg:grid-cols-[280px_1fr]">
    <Timeline />
    <GhostChat />
  </main>
)
