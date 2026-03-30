import type { OrderEvent } from '../types'

interface Props {
  events: OrderEvent[]
  finalStatus: string | null
}

interface CodeLine {
  text: string
  indent: number
  step?: string  // which workflow step this line maps to
  isComment?: boolean
  isDecorator?: boolean
  isBlank?: boolean
}

const WORKFLOW_CODE: CodeLine[] = [
  { text: '@workflow.defn', indent: 0, isDecorator: true },
  { text: 'class OrderWorkflow:', indent: 0 },
  { text: '', indent: 0, isBlank: true },
  { text: '@workflow.run', indent: 1, isDecorator: true },
  { text: 'async def run(self, order):', indent: 1 },
  { text: '    compensations = []', indent: 1 },
  { text: '    try:', indent: 1 },
  { text: '', indent: 0, isBlank: true },
  { text: '# Validate the order and store', indent: 3, isComment: true },
  { text: 'await workflow.execute_activity(', indent: 3, step: 'validate_order' },
  { text: '    validate_order, order)', indent: 3, step: 'validate_order' },
  { text: 'await workflow.execute_activity(', indent: 3, step: 'validate_store' },
  { text: '    validate_store, order)', indent: 3, step: 'validate_store' },
  { text: '', indent: 0, isBlank: true },
  { text: '# Hold payment, register compensation first', indent: 3, isComment: true },
  { text: 'compensations.append(release_hold)', indent: 3, step: 'authorize_payment' },
  { text: 'auth = await workflow.execute_activity(', indent: 3, step: 'authorize_payment' },
  { text: '    authorize_payment, order)', indent: 3, step: 'authorize_payment' },
  { text: '', indent: 0, isBlank: true },
  { text: 'await workflow.execute_activity(', indent: 3, step: 'clear_cart' },
  { text: '    clear_cart, order)', indent: 3, step: 'clear_cart' },
  { text: '', indent: 0, isBlank: true },
  { text: '# Submit — retries automatically', indent: 3, isComment: true },
  { text: 'await workflow.execute_activity(', indent: 3, step: 'submit_to_store' },
  { text: '    submit_to_store, order,', indent: 3, step: 'submit_to_store' },
  { text: '    retry=RetryPolicy(max=10))', indent: 3, step: 'submit_to_store' },
  { text: '', indent: 0, isBlank: true },
  { text: '# Wait for signal — human in the loop', indent: 3, isComment: true },
  { text: 'await workflow.wait_condition(', indent: 3, step: 'order_ready' },
  { text: '    lambda: self.order_ready)', indent: 3, step: 'order_ready' },
  { text: '', indent: 0, isBlank: true },
  { text: '# Capture only after confirmation', indent: 3, isComment: true },
  { text: 'await workflow.execute_activity(', indent: 3, step: 'capture_payment' },
  { text: '    capture_payment, auth)', indent: 3, step: 'capture_payment' },
]

const COMPENSATION_CODE: CodeLine[] = [
  { text: '', indent: 0, isBlank: true },
  { text: '# Saga: run compensations in reverse', indent: 2, isComment: true },
  { text: 'except Exception:', indent: 2 },
  { text: '    for compensate in reversed(compensations):', indent: 3, step: 'release_payment_hold' },
  { text: '        await compensate()', indent: 3, step: 'release_payment_hold' },
]

function getStepStatus(step: string, events: OrderEvent[]): string | null {
  const stepEvents = events.filter((e) => e.step === step)
  if (stepEvents.length === 0) return null
  return stepEvents[stepEvents.length - 1].status
}

export function TemporalCodeView({ events, finalStatus }: Props) {
  const showCompensation = events.some(
    (e) => e.step === 'release_payment_hold' || e.step === 'notify_customer_failure'
  )
  const allCode = showCompensation
    ? [...WORKFLOW_CODE, ...COMPENSATION_CODE]
    : WORKFLOW_CODE

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
            <span className="text-[11px] text-gray-400 font-mono">order_workflow.py</span>
          </div>

          {/* Code */}
          <div className="p-3 font-mono text-[11px] leading-[1.6]">
            {allCode.map((line, i) => {
              const stepStatus = line.step ? getStepStatus(line.step, events) : null
              const isRunning = stepStatus === 'running'
              const isCompleted = stepStatus === 'completed'
              const isRetrying = stepStatus === 'retrying'
              const isFailed = stepStatus === 'failed'

              let bgClass = ''
              let borderClass = ''
              if (isRunning) {
                bgClass = 'bg-blue-500/10'
                borderClass = 'border-l-2 border-blue-500'
              } else if (isRetrying) {
                bgClass = 'bg-yellow-500/10 animate-pulse'
                borderClass = 'border-l-2 border-yellow-500'
              } else if (isFailed) {
                bgClass = 'bg-red-500/10'
                borderClass = 'border-l-2 border-red-500'
              } else if (isCompleted) {
                bgClass = 'bg-green-500/5'
                borderClass = 'border-l-2 border-green-500/50'
              } else {
                borderClass = 'border-l-2 border-transparent'
              }

              if (line.isBlank) {
                return <div key={i} className="h-[1.6em]" />
              }

              const indent = '  '.repeat(line.indent)
              let textClass = 'text-gray-300'
              if (line.isComment) textClass = 'text-gray-500 italic'
              if (line.isDecorator) textClass = 'text-yellow-400'

              // Syntax highlighting
              let rendered = line.text
              if (!line.isComment && !line.isDecorator) {
                rendered = rendered
                  .replace(/\b(class|async|def|await|if|return|except|lambda|self)\b/g, '<kw>$1</kw>')
                  .replace(/\b(workflow|RetryPolicy)\b/g, '<mod>$1</mod>')
                  .replace(/(validate_order|validate_store|authorize_payment|clear_cart|submit_to_store|capture_payment|release_payment_hold|wait_condition|execute_activity|order_ready)/g, '<fn>$1</fn>')
                  .replace(/(max_attempts)=/g, '<arg>$1</arg>=')
                  .replace(/\b(\d+)\b/g, '<num>$1</num>')
                  .replace(/#.*$/g, '<cmt>$&</cmt>')
              }

              return (
                <div
                  key={i}
                  className={`px-2 -mx-1 rounded-sm transition-all duration-300 whitespace-pre ${bgClass} ${borderClass}`}
                >
                  <span className="text-gray-600 select-none w-6 inline-block text-right mr-3">
                    {i + 1}
                  </span>
                  <span
                    className={textClass}
                    dangerouslySetInnerHTML={{
                      __html: `${indent}${rendered}`
                        .replace(/<kw>/g, '<span class="text-purple-400 font-semibold">')
                        .replace(/<\/kw>/g, '</span>')
                        .replace(/<mod>/g, '<span class="text-blue-300">')
                        .replace(/<\/mod>/g, '</span>')
                        .replace(/<fn>/g, '<span class="text-amber-300">')
                        .replace(/<\/fn>/g, '</span>')
                        .replace(/<arg>/g, '<span class="text-orange-300">')
                        .replace(/<\/arg>/g, '</span>')
                        .replace(/<num>/g, '<span class="text-cyan-300">')
                        .replace(/<\/num>/g, '</span>')
                        .replace(/<cmt>/g, '<span class="text-gray-500 italic">')
                        .replace(/<\/cmt>/g, '</span>'),
                    }}
                  />
                </div>
              )
            })}
          </div>
        </div>

        {/* Callout below code */}
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
