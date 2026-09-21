import type { ReactNode } from "react";

export interface TaskStep {
  label: string;
  state?: "complete" | "current" | "pending";
}

interface TaskStepsProps {
  label: string;
  steps: TaskStep[];
}

export function TaskSteps({ label, steps }: TaskStepsProps) {
  return <nav className="task-step-nav" aria-label={label}>
    <ol>
      {steps.map((step, index) => <li className={step.state ?? "pending"} aria-current={step.state === "current" ? "step" : undefined} key={step.label}>
        <span>{index + 1}</span>
        <strong>{step.label}</strong>
      </li>)}
    </ol>
  </nav>;
}

interface TaskInputShellProps {
  back: ReactNode;
  title: string;
  description?: string;
  steps: TaskStep[];
  stepsLabel: string;
  notice?: ReactNode;
  children: ReactNode;
}

export function TaskInputShell({ back, title, description, steps, stepsLabel, notice, children }: TaskInputShellProps) {
  return <section className="workspace task-page task-input-page">
    {back}
    <header className="task-page-heading">
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </header>
    {notice}
    <div className="task-input-layout">
      <TaskSteps label={stepsLabel} steps={steps} />
      <div className="task-input-main">{children}</div>
    </div>
  </section>;
}

interface TaskResultShellProps {
  summary: ReactNode;
  candidates: ReactNode;
  candidateLabel: string;
  children: ReactNode;
}

export function TaskResultShell({ summary, candidates, candidateLabel, children }: TaskResultShellProps) {
  return <>
    <header className="task-result-summary">{summary}</header>
    <div className="task-result-layout">
      <aside className="task-candidate-sidebar" aria-label={candidateLabel}>{candidates}</aside>
      <div className="task-result-main">{children}</div>
    </div>
  </>;
}

