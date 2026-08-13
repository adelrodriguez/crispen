import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { CrispenLab } from "../../lab"
import "../../styles.css"

const root = document.querySelector("#root")
if (root === null) {
  throw new Error("The Vite lab root is missing")
}

createRoot(root).render(
  <StrictMode>
    <CrispenLab adapter="Vite" />
  </StrictMode>
)
