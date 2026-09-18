export interface ResidentLifeSelfContext {
  version: 1;
  /** Authored first-person identity/role. This is self-knowledge, not observed World truth. */
  role: string;
  /**
   * Small set of persistent motives that may create endogenous pressure.
   * They are not claims that any external fact currently exists or that a task has already happened.
   */
  drives: readonly string[];
}

export function cloneResidentLifeSelfContext(
  value: ResidentLifeSelfContext,
): ResidentLifeSelfContext {
  return {
    version: 1,
    role: value.role,
    drives: [...value.drives],
  };
}
