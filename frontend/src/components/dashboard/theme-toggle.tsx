import { Moon, Sun } from "lucide-react"

import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"

/**
 * Visible theme control. The provider already persists the choice and the
 * hidden "d" shortcut remains available, but the dashboard needs a labelled,
 * discoverable control.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const isDark = theme !== "light"
  const nextTheme = isDark ? "light" : "dark"
  const label = `Switch to ${nextTheme} theme`

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => setTheme(nextTheme)}
      aria-label={label}
      className="h-11 gap-1.5 px-3 sm:h-8"
    >
      {isDark ? (
        <Moon className="size-3.5" aria-hidden />
      ) : (
        <Sun className="size-3.5" aria-hidden />
      )}
      <span className="text-xs">{isDark ? "Dark" : "Light"}</span>
    </Button>
  )
}
