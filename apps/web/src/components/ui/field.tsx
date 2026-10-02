'use client';
import { Children, cloneElement, isValidElement, useId, type ReactNode } from 'react';
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const id = useId();
  function associate(nodes: ReactNode): ReactNode {
    return Children.map(nodes, (child) => {
      if (
        !isValidElement<{ id?: string; children?: ReactNode; 'aria-describedby'?: string }>(child)
      )
        return child;
      if (typeof child.type === 'string' && ['input', 'select', 'textarea'].includes(child.type))
        return cloneElement(child, { id, 'aria-describedby': hint ? `${id}-hint` : undefined });
      return child.props.children
        ? cloneElement(child, {}, associate(child.props.children))
        : child;
    });
  }
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {associate(children)}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
export function Alert({ message, success = false }: { message: string; success?: boolean }) {
  return message ? (
    <div role={success ? 'status' : 'alert'} className={`alert ${success ? 'alert-success' : ''}`}>
      {message}
    </div>
  ) : null;
}
