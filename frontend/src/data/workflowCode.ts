import type { WorkerLanguage } from "../types";

/**
 * Code line definition for the workflow code viewer.
 *
 * To add a new language:
 * 1. Add a new entry to WORKFLOW_LANGUAGES
 * 2. Add the language's code lines + compensation lines
 * 3. Add syntax highlighting rules
 * 4. Update the WorkerLanguage type in types/index.ts
 */

export interface CodeLine {
  text: string;
  indent: number;
  step?: string; // maps to an activity step name for highlighting
  isComment?: boolean;
  isDecorator?: boolean;
  isBlank?: boolean;
}

export interface LanguageDef {
  id: WorkerLanguage;
  label: string;
  filename: string;
  code: CodeLine[];
  compensation: CodeLine[];
  /** Regex replacements applied in order for syntax highlighting */
  highlighting: { pattern: RegExp; className: string }[];
}

// ─── Python ──────────────────────────────────────────────────────

const pythonCode: CodeLine[] = [
  { text: "@workflow.defn", indent: 0, isDecorator: true },
  { text: "class OrderWorkflow:", indent: 0 },
  { text: "", indent: 0, isBlank: true },
  { text: "@workflow.run", indent: 1, isDecorator: true },
  { text: "async def run(self, order):", indent: 1 },
  { text: "    compensations = []", indent: 1 },
  { text: "    try:", indent: 1 },
  { text: "", indent: 0, isBlank: true },
  { text: "# Validate the order and store", indent: 3, isComment: true },
  {
    text: "await workflow.execute_activity(",
    indent: 4,
    step: "validate_order",
  },
  {
    text: "  validate_order, order)",
    indent: 4,
    step: "validate_order",
  },
  {
    text: "await workflow.execute_activity(",
    indent: 4,
    step: "validate_store",
  },
  {
    text: "  validate_store, order)",
    indent: 4,
    step: "validate_store",
  },
  { text: "", indent: 0, isBlank: true },
  {
    text: "# Hold payment, register compensation first",
    indent: 4,
    isComment: true,
  },
  {
    text: "compensations.append(release_hold)",
    indent: 4,
    step: "authorize_payment",
  },
  {
    text: "auth = await workflow.execute_activity(",
    indent: 4,
    step: "authorize_payment",
  },
  {
    text: "  authorize_payment, order)",
    indent: 4,
    step: "authorize_payment",
  },
  { text: "", indent: 0, isBlank: true },
  {
    text: "await workflow.execute_activity(",
    indent: 4,
    step: "clear_cart",
  },
  { text: "  clear_cart, order)", indent: 4, step: "clear_cart" },
  { text: "", indent: 0, isBlank: true },
  { text: "# Submit — retries automatically", indent: 3, isComment: true },
  {
    text: "await workflow.execute_activity(",
    indent: 4,
    step: "submit_to_store",
  },
  {
    text: "  submit_to_store, order,",
    indent: 4,
    step: "submit_to_store",
  },
  {
    text: "  retry=RetryPolicy(max=10))",
    indent: 4,
    step: "submit_to_store",
  },
  { text: "", indent: 0, isBlank: true },
  { text: "# Wait for signal — human in the loop", indent: 3, isComment: true },
  {
    text: "await workflow.wait_condition(",
    indent: 4,
    step: "order_ready",
  },
  {
    text: "  lambda: self.order_ready)",
    indent: 4,
    step: "order_ready",
  },
  { text: "", indent: 0, isBlank: true },
  { text: "# Capture only after confirmation", indent: 3, isComment: true },
  {
    text: "await workflow.execute_activity(",
    indent: 4,
    step: "capture_payment",
  },
  {
    text: "  capture_payment, auth)",
    indent: 4,
    step: "capture_payment",
  },
];

const pythonCompensation: CodeLine[] = [
  { text: "", indent: 0, isBlank: true },
  { text: "# Saga: run compensations in reverse", indent: 2, isComment: true },
  { text: "except Exception:", indent: 2 },
  {
    text: "for comp in reversed(compensations):",
    indent: 3,
    step: "release_payment_hold",
  },
  { text: "await comp()", indent: 4, step: "release_payment_hold" },
];

const pythonHighlighting = [
  {
    pattern:
      /\b(class|async|def|await|if|return|except|lambda|self|for|in|try)\b/g,
    className: "text-purple-400 font-semibold",
  },
  { pattern: /\b(workflow|RetryPolicy)\b/g, className: "text-blue-300" },
  {
    pattern:
      /(validate_order|validate_store|authorize_payment|clear_cart|submit_to_store|capture_payment|release_payment_hold|release_hold|wait_condition|execute_activity|order_ready|compensations|reversed|append)\b/g,
    className: "text-amber-300",
  },
  { pattern: /(max)=/g, className: "text-orange-300" },
  { pattern: /\b(\d+)\b/g, className: "text-cyan-300" },
];

// ─── Go ──────────────────────────────────────────────────────────

const goCode: CodeLine[] = [
  { text: "type Compensations []any", indent: 0 },

  {
    text: "func (s *Compensations) AddCompensation(activity any) {",
    indent: 0,
  },
  { text: "*s = append(*s, activity)", indent: 1 },
  {
    text: "}",
    indent: 0,
  },
  { text: "", indent: 0 },
  { text: "func OrderWorkflow(ctx workflow.Context,", indent: 0 },
  { text: "    order OrderInput) (result Result, err error) {", indent: 0 },
  { text: "", indent: 0, isBlank: true },
  { text: "var compensations Compensations", indent: 1 },
  { text: "defer func() {", indent: 1 },
  { text: "    if err != nil {", indent: 1 },
  {
    text: "        compensations.Compensate(ctx)",
    indent: 1,
    step: "release_payment_hold",
  },
  { text: "    }", indent: 1 },
  { text: "}()", indent: 1 },
  { text: "", indent: 0, isBlank: true },
  { text: "// Validate order and store", indent: 1, isComment: true },
  {
    text: "err := workflow.ExecuteActivity(ctx,",
    indent: 1,
    step: "validate_order",
  },
  {
    text: '    "ValidateOrder", order).Get(ctx, nil)',
    indent: 1,
    step: "validate_order",
  },
  {
    text: "err = workflow.ExecuteActivity(ctx,",
    indent: 1,
    step: "validate_store",
  },
  {
    text: '    "ValidateStore", order).Get(ctx, nil)',
    indent: 1,
    step: "validate_store",
  },
  { text: "", indent: 0, isBlank: true },
  {
    text: "// Hold payment — register compensation first",
    indent: 1,
    isComment: true,
  },
  {
    text: 'compensations.AddCompensation("ReleasePaymentHold", order)',
    indent: 1,
    step: "authorize_payment",
  },
  {
    text: "err = workflow.ExecuteActivity(ctx,",
    indent: 1,
    step: "authorize_payment",
  },
  {
    text: '    "AuthorizePayment", order).Get(ctx, &auth)',
    indent: 1,
    step: "authorize_payment",
  },
  { text: "", indent: 0, isBlank: true },
  { text: "workflow.ExecuteActivity(ctx,", indent: 1, step: "clear_cart" },
  {
    text: '    "ClearCart", order).Get(ctx, nil)',
    indent: 1,
    step: "clear_cart",
  },
  { text: "", indent: 0, isBlank: true },
  {
    text: "// Submit to store — retries automatically",
    indent: 1,
    isComment: true,
  },
  {
    text: "submitCtx := workflow.WithActivityOptions(ctx,",
    indent: 1,
    step: "submit_to_store",
  },
  {
    text: "    RetryPolicy{MaxAttempts: 10})",
    indent: 1,
    step: "submit_to_store",
  },
  {
    text: "workflow.ExecuteActivity(submitCtx,",
    indent: 1,
    step: "submit_to_store",
  },
  {
    text: '    "SubmitToStore", order).Get(ctx, nil)',
    indent: 1,
    step: "submit_to_store",
  },
  { text: "", indent: 0, isBlank: true },
  {
    text: "// Wait for signal — human in the loop",
    indent: 1,
    isComment: true,
  },
  {
    text: 'workflow.GetSignalChannel(ctx, "order_ready")',
    indent: 1,
    step: "order_ready",
  },
  { text: "    .Receive(ctx, nil)", indent: 1, step: "order_ready" },
  { text: "", indent: 0, isBlank: true },
  { text: "// Capture only after confirmation", indent: 1, isComment: true },
  { text: "workflow.ExecuteActivity(ctx,", indent: 1, step: "capture_payment" },
  {
    text: '    "CapturePayment", order).Get(ctx, nil)',
    indent: 1,
    step: "capture_payment",
  },
  { text: "", indent: 0, isBlank: true },
  { text: "return Result{Success: true}, nil", indent: 1 },
  { text: "}", indent: 0 },
];

// Go compensation is handled by the defer block at the top of the workflow,
// which already has step: 'release_payment_hold' for highlighting.
const goCompensation: CodeLine[] = [];

const goHighlighting = [
  {
    pattern:
      /\b(func|var|err|return|for|if|range|nil|true|false|append|len|defer)\b/g,
    className: "text-purple-400 font-semibold",
  },
  {
    pattern:
      /\b(workflow|temporal|RetryPolicy|Context|OrderInput|Result|Compensations)\b/g,
    className: "text-blue-300",
  },
  {
    pattern:
      /(ExecuteActivity|WithActivityOptions|GetSignalChannel|Receive|Get|NewDisconnectedContext|MaxAttempts|AddCompensation|Compensate|Await)\b/g,
    className: "text-amber-300",
  },
  {
    pattern:
      /("ValidateOrder"|"ValidateStore"|"AuthorizePayment"|"ClearCart"|"SubmitToStore"|"CapturePayment"|"order_ready")/g,
    className: "text-green-300",
  },
  { pattern: /\b(\d+)\b/g, className: "text-cyan-300" },
];

// ─── TypeScript ─────────────────────────────────────────────────

const typescriptCode: CodeLine[] = [
  { text: "const acts = proxyActivities<Activities>({", indent: 0 },
  { text: "  startToCloseTimeout: '10s',", indent: 0 },
  { text: "  retry: { maximumAttempts: 3 } })", indent: 0 },
  { text: "", indent: 0, isBlank: true },
  { text: "export async function OrderWorkflow(", indent: 0 },
  { text: "  order: OrderInput): Promise<Result> {", indent: 0 },
  { text: "", indent: 0, isBlank: true },
  { text: "let orderReady = false", indent: 1 },
  { text: "setHandler(orderReadySignal,", indent: 1 },
  { text: "  () => { orderReady = true })", indent: 1 },
  { text: "", indent: 0, isBlank: true },
  { text: "const compensations: Compensation[] = []", indent: 1 },
  { text: "try {", indent: 1 },
  { text: "", indent: 0, isBlank: true },
  { text: "// Validate the order and store", indent: 2, isComment: true },
  { text: "await acts.validateOrder(order)", indent: 2, step: "validate_order" },
  { text: "await acts.validateStore(order)", indent: 2, step: "validate_store" },
  { text: "", indent: 0, isBlank: true },
  {
    text: "// Hold payment — register compensation first",
    indent: 2,
    isComment: true,
  },
  {
    text: "compensations.push(() =>",
    indent: 2,
    step: "authorize_payment",
  },
  {
    text: "  acts.releasePaymentHold(order))",
    indent: 2,
    step: "authorize_payment",
  },
  {
    text: "const auth = await acts.authorizePayment(",
    indent: 2,
    step: "authorize_payment",
  },
  { text: "  order)", indent: 2, step: "authorize_payment" },
  { text: "", indent: 0, isBlank: true },
  { text: "await acts.clearCart(order)", indent: 2, step: "clear_cart" },
  { text: "", indent: 0, isBlank: true },
  { text: "// Submit — retries automatically", indent: 2, isComment: true },
  {
    text: "await submitActs.submitToStore(order)",
    indent: 2,
    step: "submit_to_store",
  },
  { text: "", indent: 0, isBlank: true },
  {
    text: "// Wait for signal — human in the loop",
    indent: 2,
    isComment: true,
  },
  { text: "await condition(() => orderReady)", indent: 2, step: "order_ready" },
  { text: "", indent: 0, isBlank: true },
  {
    text: "// Capture only after confirmation",
    indent: 2,
    isComment: true,
  },
  { text: "await acts.capturePayment(auth)", indent: 2, step: "capture_payment" },
];

const typescriptCompensation: CodeLine[] = [
  { text: "", indent: 0, isBlank: true },
  {
    text: "// Saga: run compensations in reverse",
    indent: 1,
    isComment: true,
  },
  { text: "} catch (err) {", indent: 1 },
  {
    text: "  await CancellationScope.nonCancellable(",
    indent: 1,
  },
  { text: "    async () => {", indent: 1 },
  {
    text: "      for (const comp of compensations.reverse())",
    indent: 1,
    step: "release_payment_hold",
  },
  { text: "        await comp()", indent: 1, step: "release_payment_hold" },
  { text: "  })", indent: 1 },
  { text: "}", indent: 1 },
];

const typescriptHighlighting = [
  {
    pattern:
      /\b(const|let|async|function|await|return|for|of|try|catch|export|throw|new)\b/g,
    className: "text-purple-400 font-semibold",
  },
  {
    pattern:
      /\b(proxyActivities|CancellationScope|condition|setHandler|defineSignal|defineQuery)\b/g,
    className: "text-blue-300",
  },
  {
    pattern:
      /(validateOrder|validateStore|authorizePayment|clearCart|submitToStore|capturePayment|releasePaymentHold|notifyCustomer|nonCancellable|compensations|reverse|orderReady|orderReadySignal)\b/g,
    className: "text-amber-300",
  },
  {
    pattern: /\b(Activities|OrderInput|Result|Compensation|Promise)\b/g,
    className: "text-green-300",
  },
  { pattern: /'[^']*'/g, className: "text-green-300" },
  { pattern: /\b(\d+)\b/g, className: "text-cyan-300" },
];

// ─── Java ───────────────────────────────────────────────────────
// Java SDK has first-class Saga support via the Saga class.

const javaCode: CodeLine[] = [
  { text: "OrderActivities acts = Workflow.newActivityStub(", indent: 0 },
  { text: "    OrderActivities.class, defaultOptions)", indent: 0 },
  { text: "", indent: 0, isBlank: true },
  { text: "public Map<String, Object> run(", indent: 0 },
  { text: "    Map<String, Object> order) {", indent: 0 },
  { text: "", indent: 0, isBlank: true },
  { text: "// Built-in Saga manages compensations", indent: 1, isComment: true },
  { text: "Saga saga = new Saga(new Saga.Options.Builder()", indent: 1 },
  { text: "    .setContinueWithError(true).build())", indent: 1 },
  { text: "try {", indent: 1 },
  { text: "", indent: 0, isBlank: true },
  { text: "// Validate the order and store", indent: 2, isComment: true },
  { text: "acts.validateOrder(order)", indent: 2, step: "validate_order" },
  { text: "acts.validateStore(order)", indent: 2, step: "validate_store" },
  { text: "", indent: 0, isBlank: true },
  {
    text: "// Hold payment — register compensation first",
    indent: 2,
    isComment: true,
  },
  {
    text: "saga.addCompensation(() ->",
    indent: 2,
    step: "authorize_payment",
  },
  {
    text: "    acts.releasePaymentHold(order))",
    indent: 2,
    step: "authorize_payment",
  },
  {
    text: "auth = acts.authorizePayment(order)",
    indent: 2,
    step: "authorize_payment",
  },
  { text: "", indent: 0, isBlank: true },
  { text: "acts.clearCart(order)", indent: 2, step: "clear_cart" },
  { text: "", indent: 0, isBlank: true },
  { text: "// Submit — retries automatically", indent: 2, isComment: true },
  {
    text: "submitActs.submitToStore(order)",
    indent: 2,
    step: "submit_to_store",
  },
  { text: "", indent: 0, isBlank: true },
  {
    text: "// Wait for signal — human in the loop",
    indent: 2,
    isComment: true,
  },
  { text: "Workflow.await(() -> orderReady)", indent: 2, step: "order_ready" },
  { text: "", indent: 0, isBlank: true },
  {
    text: "// Capture only after confirmation",
    indent: 2,
    isComment: true,
  },
  { text: "acts.capturePayment(auth)", indent: 2, step: "capture_payment" },
];

const javaCompensation: CodeLine[] = [
  { text: "", indent: 0, isBlank: true },
  {
    text: "// Saga.compensate() runs in reverse,",
    indent: 1,
    isComment: true,
  },
  {
    text: "// inside a detached cancellation scope",
    indent: 1,
    isComment: true,
  },
  { text: "} catch (Exception e) {", indent: 1 },
  { text: "    saga.compensate()", indent: 1, step: "release_payment_hold" },
  { text: "}", indent: 1 },
];

const javaHighlighting = [
  {
    pattern:
      /\b(public|class|interface|void|new|try|catch|return|Map|String|Object)\b/g,
    className: "text-purple-400 font-semibold",
  },
  {
    pattern: /\b(Workflow|Saga|OrderActivities|ActivityOptions|RetryOptions)\b/g,
    className: "text-blue-300",
  },
  {
    pattern:
      /(validateOrder|validateStore|authorizePayment|clearCart|submitToStore|capturePayment|releasePaymentHold|notifyCustomer|addCompensation|compensate|await|newActivityStub|orderReady)\b/g,
    className: "text-amber-300",
  },
  {
    pattern:
      /\b(OrderInput|Options|Builder)\b/g,
    className: "text-green-300",
  },
  { pattern: /@\w+/g, className: "text-yellow-400" },
  { pattern: /\b(\d+)\b/g, className: "text-cyan-300" },
  { pattern: /\b(true|false|null)\b/g, className: "text-cyan-300" },
];

// ─── .NET (C#) ──────────────────────────────────────────────────

const dotnetCode: CodeLine[] = [
  { text: "[Workflow(\"OrderWorkflow\")]", indent: 0, isDecorator: true },
  { text: "public class OrderWorkflow {", indent: 0 },
  { text: "", indent: 0, isBlank: true },
  { text: "[WorkflowRun]", indent: 1, isDecorator: true },
  { text: "public async Task<Result> RunAsync(", indent: 1 },
  { text: "    OrderInput order) {", indent: 1 },
  { text: "", indent: 0, isBlank: true },
  { text: "var compensations = new List<Func<Task>>()", indent: 2 },
  { text: "try {", indent: 2 },
  { text: "", indent: 0, isBlank: true },
  { text: "// Validate the order and store", indent: 3, isComment: true },
  {
    text: "await Workflow.ExecuteActivityAsync(",
    indent: 3,
    step: "validate_order",
  },
  {
    text: "  (a) => a.ValidateOrder(order), options)",
    indent: 3,
    step: "validate_order",
  },
  {
    text: "await Workflow.ExecuteActivityAsync(",
    indent: 3,
    step: "validate_store",
  },
  {
    text: "  (a) => a.ValidateStore(order), options)",
    indent: 3,
    step: "validate_store",
  },
  { text: "", indent: 0, isBlank: true },
  {
    text: "// Hold payment — register compensation first",
    indent: 3,
    isComment: true,
  },
  {
    text: "compensations.Add(() =>",
    indent: 3,
    step: "authorize_payment",
  },
  {
    text: "  ExecuteActivityAsync(",
    indent: 3,
    step: "authorize_payment",
  },
  {
    text: "    (a) => a.ReleasePaymentHold(order)))",
    indent: 3,
    step: "authorize_payment",
  },
  {
    text: "var auth = await Workflow.ExecuteActivityAsync(",
    indent: 3,
    step: "authorize_payment",
  },
  {
    text: "  (a) => a.AuthorizePayment(order), options)",
    indent: 3,
    step: "authorize_payment",
  },
  { text: "", indent: 0, isBlank: true },
  {
    text: "await Workflow.ExecuteActivityAsync(",
    indent: 3,
    step: "clear_cart",
  },
  {
    text: "  (a) => a.ClearCart(order), options)",
    indent: 3,
    step: "clear_cart",
  },
  { text: "", indent: 0, isBlank: true },
  { text: "// Submit — retries automatically", indent: 3, isComment: true },
  {
    text: "await Workflow.ExecuteActivityAsync(",
    indent: 3,
    step: "submit_to_store",
  },
  {
    text: "  (a) => a.SubmitToStore(order), submitOpts)",
    indent: 3,
    step: "submit_to_store",
  },
  { text: "", indent: 0, isBlank: true },
  {
    text: "// Wait for signal — human in the loop",
    indent: 3,
    isComment: true,
  },
  {
    text: "await Workflow.WaitConditionAsync(",
    indent: 3,
    step: "order_ready",
  },
  { text: "  () => orderReady)", indent: 3, step: "order_ready" },
  { text: "", indent: 0, isBlank: true },
  { text: "// Capture only after confirmation", indent: 3, isComment: true },
  {
    text: "await Workflow.ExecuteActivityAsync(",
    indent: 3,
    step: "capture_payment",
  },
  {
    text: "  (a) => a.CapturePayment(auth), options)",
    indent: 3,
    step: "capture_payment",
  },
];

const dotnetCompensation: CodeLine[] = [
  { text: "", indent: 0, isBlank: true },
  {
    text: "// Saga: run compensations in reverse",
    indent: 2,
    isComment: true,
  },
  { text: "} catch (Exception) {", indent: 2 },
  {
    text: "  for (var i = compensations.Count - 1; i >= 0; i--)",
    indent: 2,
    step: "release_payment_hold",
  },
  {
    text: "    await compensations[i]()",
    indent: 2,
    step: "release_payment_hold",
  },
  { text: "}", indent: 2 },
];

const dotnetHighlighting = [
  {
    pattern:
      /\b(public|class|async|await|var|new|try|catch|return|for|int)\b/g,
    className: "text-purple-400 font-semibold",
  },
  {
    pattern:
      /\b(Workflow|Task|List|Func|ActivityOptions|RetryPolicy)\b/g,
    className: "text-blue-300",
  },
  {
    pattern:
      /(ValidateOrder|ValidateStore|AuthorizePayment|ClearCart|SubmitToStore|CapturePayment|ReleasePaymentHold|NotifyCustomer|ExecuteActivityAsync|WaitConditionAsync|Add|compensations|orderReady)\b/g,
    className: "text-amber-300",
  },
  {
    pattern: /\b(OrderInput|OrderWorkflow|Result|Exception)\b/g,
    className: "text-green-300",
  },
  { pattern: /\[.*?\]/g, className: "text-yellow-400" },
  { pattern: /\b(\d+)\b/g, className: "text-cyan-300" },
  { pattern: /\b(true|false|null)\b/g, className: "text-cyan-300" },
];

// ─── Registry ────────────────────────────────────────────────────

export const WORKFLOW_LANGUAGES: LanguageDef[] = [
  {
    id: "python",
    label: "Python",
    filename: "order_workflow.py",
    code: pythonCode,
    compensation: pythonCompensation,
    highlighting: pythonHighlighting,
  },
  {
    id: "go",
    label: "Go",
    filename: "order_workflow.go",
    code: goCode,
    compensation: goCompensation,
    highlighting: goHighlighting,
  },
  {
    id: "typescript",
    label: "TypeScript",
    filename: "workflows.ts",
    code: typescriptCode,
    compensation: typescriptCompensation,
    highlighting: typescriptHighlighting,
  },
  {
    id: "java",
    label: "Java",
    filename: "OrderWorkflowImpl.java",
    code: javaCode,
    compensation: javaCompensation,
    highlighting: javaHighlighting,
  },
  {
    id: "dotnet",
    label: "C# (.NET)",
    filename: "OrderWorkflow.cs",
    code: dotnetCode,
    compensation: dotnetCompensation,
    highlighting: dotnetHighlighting,
  },
];

export function getLanguageDef(lang: WorkerLanguage): LanguageDef {
  return WORKFLOW_LANGUAGES.find((l) => l.id === lang) ?? WORKFLOW_LANGUAGES[0];
}
