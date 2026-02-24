# Team in a Box -- Evaluation Code

Evaluation UI and service layer extracted from the Deepify AI "Team in a Box" platform.

## Files

| File | Description |
|------|-------------|
| `evalService.ts` | Service layer -- CRUD for test cases and eval runs, Judge LLM scoring (PASS/FAIL/WARN), Supabase persistence |
| `EvalTestCaseForm.tsx` | React form component for creating and editing evaluation test cases |
| `EvaluationDashboard.tsx` | Full dashboard page -- test case list, run history, pass/fail metrics, inline test execution |

## How it works

1. **Test cases** define an agent, input prompt, expected output, and scoring criteria
2. **Eval runs** execute the agent via `tracedLLMCall()` and score the result with a Judge LLM
3. **Judge LLM** rates responses 0-100 on accuracy, completeness, brand voice, and usefulness
4. **Verdicts** are PASS (>= 70), WARN (50-69), or FAIL (< 50)
5. All runs are traced through LangFuse for observability

## Dependencies

These files depend on the TiaB platform services:

- `src/services/supabase.ts` -- Supabase client
- `src/services/tracedAgent.ts` -- `tracedLLMCall()` / `judgedLLMCall()`
- `src/services/langfuse.ts` -- LangFuse singleton
- `src/data/employeeData.ts` -- agent roster

## Supabase tables

- `eval_test_cases` -- test case definitions
- `eval_runs` -- execution results with scores and verdicts
