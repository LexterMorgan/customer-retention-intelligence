import type { ReactNode } from "react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

type SectionCardProps = {
  id?: string
  title: string
  description?: string
  footnote?: string
  actions?: ReactNode
  className?: string
  children: ReactNode
}

export function SectionCard({
  id,
  title,
  description,
  footnote,
  actions,
  className,
  children,
}: SectionCardProps) {
  return (
    <Card
      id={id}
      size="sm"
      className={cn(
        "scroll-mt-6 gap-0 py-0 shadow-none ring-border/70",
        className
      )}
    >
      <CardHeader className="gap-1 border-b border-border/70 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-0.5">
            <CardTitle className="dashboard-card-title">{title}</CardTitle>
            {description ? (
              <CardDescription className="text-xs leading-relaxed text-pretty">
                {description}
              </CardDescription>
            ) : null}
          </div>
          {actions}
        </div>
      </CardHeader>
      <CardContent className="gap-3 px-4 py-3.5">
        {children}
        {footnote ? <p className="dashboard-footnote">{footnote}</p> : null}
      </CardContent>
    </Card>
  )
}
