import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerSw } from "./lib/push";

createRoot(document.getElementById("root")!).render(<App />);

// Register service worker for background push notifications (non-blocking)
void registerSw();
