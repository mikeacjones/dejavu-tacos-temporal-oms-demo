import type { OrderEvent, WorkerLanguage } from '../types'
import { getLanguageDef, type CodeLine, type LanguageDef } from '../data/workflowCode'

interface Props {
  events: OrderEvent[]
  finalStatus: string | null
  language: WorkerLanguage
}

function getStepStatus(step: string, events: OrderEvent[]): string | null {
  const stepEvents = events.filter((e) => e.step === step)
  if (stepEvents.length === 0) return null
  return stepEvents[stepEvents.length - 1].status
}

function highlightSyntax(text: string, lang: LanguageDef): string {
  // Tokenize: find all matches with their positions, apply non-overlapping spans
  const tokens: { start: number; end: number; className: string }[] = []

  for (const rule of lang.highlighting) {
    // Reset regex state for global patterns
    const re = new RegExp(rule.pattern.source, rule.pattern.flags)
    let match: RegExpExecArray | null
    while ((match = re.exec(text)) !== null) {
      const start = match.index
      const end = start + match[0].length
      // Only add if it doesn't overlap with existing tokens
      const overlaps = tokens.some((t) => start < t.end && end > t.start)
      if (!overlaps) {
        tokens.push({ start, end, className: rule.className })
      }
    }
  }

  // Sort by position
  tokens.sort((a, b) => a.start - b.start)

  // Build result string
  let result = ''
  let cursor = 0
  for (const token of tokens) {
    result += escapeHtml(text.slice(cursor, token.start))
    result += `<span class="${token.className}">${escapeHtml(text.slice(token.start, token.end))}</span>`
    cursor = token.end
  }
  result += escapeHtml(text.slice(cursor))
  return result
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function TemporalCodeView({ events, finalStatus, language }: Props) {
  const lang = getLanguageDef(language)

  const allCode = [...lang.code, ...lang.compensation]

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-gray-700">
        <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">
          The Actual Code
        </h3>
        <p className="text-xs text-gray-500 mt-0.5">
          That's it. Temporal handles the rest.
        </p>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="bg-[#0d1117] rounded-xl border border-gray-700/50 overflow-hidden">
          {/* File tab */}
          <div className="flex items-center gap-2 px-4 py-2 bg-[#161b22] border-b border-gray-700/50">
            <span className="text-[10px] text-gray-500">📄</span>
            <span className="text-[11px] text-gray-400 font-mono">{lang.filename}</span>
            <span className="text-[10px] text-gray-600 ml-auto">{lang.label}</span>
          </div>

          {/* Code */}
          <div className="p-3 font-mono text-[11px] leading-[1.6]">
            {allCode.map((line, i) => (
              <CodeLineRow
                key={i}
                line={line}
                lineNum={i + 1}
                events={events}
                lang={lang}
              />
            ))}
          </div>
        </div>

        {/* Callout */}
        <div className="mt-4 text-center">
          {events.length === 0 && (
            <p className="text-xs text-gray-500">
              Place an order to see the code light up as each activity runs
            </p>
          )}
          {events.length > 0 && !finalStatus && (
            <p className="text-xs text-purple-400">
              No queues. No retry services. No dead letter queues. No cron jobs.
            </p>
          )}
          {finalStatus === 'completed' && (
            <p className="text-xs text-green-400 font-medium">
              ~30 lines of code. Retries, signals, and compensation — all built in.
            </p>
          )}
          {(finalStatus === 'failed' || finalStatus === 'refunded') && (
            <p className="text-xs text-yellow-400 font-medium">
              Compensation ran automatically. No manual cleanup needed.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function CodeLineRow({
  line,
  lineNum,
  events,
  lang,
}: {
  line: CodeLine
  lineNum: number
  events: OrderEvent[]
  lang: LanguageDef
}) {
  if (line.isBlank) {
    return <div className="h-[1.6em]" />
  }

  const stepStatus = line.step ? getStepStatus(line.step, events) : null

  let bgClass = ''
  let borderClass = 'border-l-2 border-transparent'
  if (stepStatus === 'running') {
    bgClass = 'bg-blue-500/10'
    borderClass = 'border-l-2 border-blue-500'
  } else if (stepStatus === 'retrying') {
    bgClass = 'bg-yellow-500/10 animate-pulse'
    borderClass = 'border-l-2 border-yellow-500'
  } else if (stepStatus === 'failed') {
    bgClass = 'bg-red-500/10'
    borderClass = 'border-l-2 border-red-500'
  } else if (stepStatus === 'completed') {
    bgClass = 'bg-green-500/5'
    borderClass = 'border-l-2 border-green-500/50'
  }

  const indent = '  '.repeat(line.indent)
  let textClass = 'text-gray-300'
  if (line.isComment) textClass = 'text-gray-500 italic'
  if (line.isDecorator) textClass = 'text-yellow-400'

  const highlighted =
    line.isComment || line.isDecorator
      ? line.text
      : highlightSyntax(line.text, lang)

  return (
    <div className={`px-2 -mx-1 rounded-sm transition-all duration-300 whitespace-pre ${bgClass} ${borderClass}`}>
      <span className="text-gray-600 select-none w-6 inline-block text-right mr-3">
        {lineNum}
      </span>
      <span
        className={textClass}
        dangerouslySetInnerHTML={{ __html: `${indent}${highlighted}` }}
      />
    </div>
  )
}
