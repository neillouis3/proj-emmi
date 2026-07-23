/** Literal argument — string, number, boolean, null, or table object. */
export type LiteralArg = {
  type: 'literal'
  value: string | number | boolean | null | Record<string, unknown>
}

/** Reference to a previously assigned variable in scope. */
export type VarRefArg = {
  type: 'var'
  name: string
}

export type Arg = LiteralArg | VarRefArg

/** One automation statement. */
export type Statement =
  | {
      type: 'assign'
      output: string
      fn: string
      args: Arg[]
    }
  | {
      type: 'call'
      fn: string
      args: Arg[]
    }
  | {
      type: 'if'
      condition: Arg
      body: Statement[]
      elseBody?: Statement[]
    }
  | {
      type: 'for'
      item: string
      list: Arg
      body: Statement[]
    }
  | {
      type: 'try'
      body: Statement[]
      catchBody: Statement[]
    }
  | {
      type: 'retry'
      times: number
      delayMs: number
      body: Statement[]
    }

export type AutomationScript = {
  statements: Statement[]
}
