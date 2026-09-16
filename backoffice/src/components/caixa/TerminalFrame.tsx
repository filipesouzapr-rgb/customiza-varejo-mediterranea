import type { ReactNode } from 'react'

interface Props {
  titulo: string
  children: ReactNode
  rodape?: ReactNode
}

export function TerminalFrame({ titulo, children, rodape }: Props) {
  return (
    <div className="terminal-page">
      <div className="terminal">
        <div className="titlebar">
          <span className="titlebar-text">{titulo}</span>
        </div>
        <div className="terminal-content">{children}</div>
        {rodape}
      </div>
    </div>
  )
}
