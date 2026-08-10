import { CrispenScript } from "crispen/next"
import "../../styles.css"

export const metadata = {
  description: "A visible test surface for Crispen deployment checks.",
  title: "Crispen Next.js calibration bench",
}

export default function RootLayout({ children }: { readonly children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <CrispenScript />
        {children}
      </body>
    </html>
  )
}
