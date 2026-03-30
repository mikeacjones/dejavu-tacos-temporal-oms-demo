import type { ArchitectureMode, FailureScenario, PresentationMode, Settings } from '../types'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  settings: Settings
  onSave: (settings: Settings) => void
}

export function SettingsModal({ open, onClose, settings, onSave }: SettingsModalProps) {
  if (!open) return null

  const handleChange = (key: keyof Settings, value: string) => {
    const updated = { ...settings, [key]: value }
    onSave(updated)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-gray-800 rounded-2xl shadow-2xl w-[440px] max-h-[80vh] overflow-y-auto border border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚙️</span>
            <h2 className="text-lg font-bold text-gray-200">Demo Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-xl"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Architecture Mode */}
          <div>
            <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3">
              Architecture Mode
            </h3>
            <div className="space-y-2">
              <RadioOption
                name="mode"
                value="traditional"
                checked={settings.mode === 'traditional'}
                onChange={(v) => handleChange('mode', v as ArchitectureMode)}
                label="Traditional (Direct Calls)"
                description="Sequential service calls with no retry or compensation"
                color="red"
              />
              <RadioOption
                name="mode"
                value="temporal"
                checked={settings.mode === 'temporal'}
                onChange={(v) => handleChange('mode', v as ArchitectureMode)}
                label="Temporal"
                description="Durable workflow with retries, signals, and compensation"
                color="purple"
              />
            </div>
          </div>

          {/* Failure Scenario */}
          <div>
            <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3">
              Failure Scenario
            </h3>
            <div className="space-y-2">
              <RadioOption
                name="failure"
                value="none"
                checked={settings.failure_scenario === 'none'}
                onChange={(v) => handleChange('failure_scenario', v as FailureScenario)}
                label="None (Happy Path)"
                description="Everything works perfectly"
                color="green"
              />
              <RadioOption
                name="failure"
                value="store_connectivity"
                checked={settings.failure_scenario === 'store_connectivity'}
                onChange={(v) => handleChange('failure_scenario', v as FailureScenario)}
                label="Store Connectivity Failure"
                description="Store loses internet mid-order (default)"
                color="yellow"
              />
              <RadioOption
                name="failure"
                value="payment_error"
                checked={settings.failure_scenario === 'payment_error'}
                onChange={(v) => handleChange('failure_scenario', v as FailureScenario)}
                label="Payment Service Error"
                description="Payment gateway times out"
                color="yellow"
              />
              <RadioOption
                name="failure"
                value="random_chaos"
                checked={settings.failure_scenario === 'random_chaos'}
                onChange={(v) => handleChange('failure_scenario', v as FailureScenario)}
                label="Random Chaos"
                description="30% chance of failure at any step"
                color="red"
              />
            </div>
          </div>

          {/* Presentation Mode */}
          <div>
            <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3">
              Presentation Mode
            </h3>
            <div className="space-y-2">
              <RadioOption
                name="presentation"
                value="simple"
                checked={settings.presentation_mode === 'simple'}
                onChange={(v) => handleChange('presentation_mode', v as PresentationMode)}
                label="Simple"
                description="High-level step status only"
                color="blue"
              />
              <RadioOption
                name="presentation"
                value="detailed"
                checked={settings.presentation_mode === 'detailed'}
                onChange={(v) => handleChange('presentation_mode', v as PresentationMode)}
                label="Detailed"
                description="Show retries, error messages, and payloads"
                color="blue"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function RadioOption({
  name,
  value,
  checked,
  onChange,
  label,
  description,
}: {
  name: string
  value: string
  checked: boolean
  onChange: (value: string) => void
  label: string
  description: string
  color: string
}) {
  return (
    <label
      className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all hover:border-gray-600 ${
        checked ? 'border-orange-500 bg-orange-500/10' : 'border-gray-700 bg-gray-800'
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="mt-0.5 accent-orange-500"
      />
      <div>
        <p className="text-sm font-semibold text-gray-200">{label}</p>
        <p className="text-xs text-gray-400">{description}</p>
      </div>
    </label>
  )
}
