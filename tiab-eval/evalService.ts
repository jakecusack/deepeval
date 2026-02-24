// Evaluation service -- CRUD for test cases + evaluation runner with Judge LLM scoring

import { supabase } from './supabase';
import { callLLM, type ModelProvider } from './llm';
import { tracedLLMCall } from './tracedAgent';
import { langfuse } from './langfuse';
import { getEmployeeById } from '@/data/employeeData';
import { MODEL_CONFIG } from './modelConfig';

// ---- Types ----

export interface EvalTestCase {
  id: string;
  name: string;
  suite_name: string;
  agent_id: string | null;
  input_prompt: string;
  expected_behavior: string | null;
  tags: string[];
  created_at: string;
}

export interface EvalRun {
  id: string;
  test_case_id: string;
  agent_id: string;
  provider: string;
  model: string;
  input_prompt: string;
  output: string;
  trace_id: string | null;
  latency_ms: number | null;
  token_count: number | null;
  accuracy_score: number | null;
  completeness_score: number | null;
  voice_score: number | null;
  usefulness_score: number | null;
  overall_score: number | null;
  judge_feedback: string | null;
  verdict: 'PASS' | 'FAIL' | 'WARN' | null;
  created_at: string;
  // joined fields
  test_case?: EvalTestCase;
}

export interface EvalStats {
  totalRuns: number;
  passCount: number;
  warnCount: number;
  failCount: number;
  passRate: number;
  avgScore: number;
  avgLatency: number;
}

export interface AgentConfig {
  provider: ModelProvider;
  model: string;
}

// ---- Enhanced Judge Prompt (returns 4 dimensions) ----

const EVAL_JUDGE_PROMPT = `You are a strict quality judge for AI agent outputs. Evaluate the given output on these criteria:

1. ACCURACY (0-25): Are facts correct? No hallucinations?
2. COMPLETENESS (0-25): Does it fully address the request?
3. BRAND VOICE (0-25): Professional, helpful, no jargon overload?
4. USEFULNESS (0-25): Would the user find this actionable?

Respond in EXACTLY this format (no other text):
ACCURACY: <score 0-25>
COMPLETENESS: <score 0-25>
VOICE: <score 0-25>
USEFULNESS: <score 0-25>
SCORE: <total 0-100>
FEEDBACK: <one sentence summary>`;

function parseJudgeOutput(raw: string): {
  accuracy: number;
  completeness: number;
  voice: number;
  usefulness: number;
  overall: number;
  feedback: string;
} {
  const num = (pattern: RegExp): number => {
    const m = raw.match(pattern);
    return m ? Math.min(25, Math.max(0, parseInt(m[1], 10))) : 0;
  };
  const accuracy = num(/ACCURACY:\s*(\d+)/);
  const completeness = num(/COMPLETENESS:\s*(\d+)/);
  const voice = num(/VOICE:\s*(\d+)/);
  const usefulness = num(/USEFULNESS:\s*(\d+)/);

  const scoreMatch = raw.match(/SCORE:\s*(\d+)/);
  const overall = scoreMatch
    ? Math.min(100, Math.max(0, parseInt(scoreMatch[1], 10)))
    : accuracy + completeness + voice + usefulness;

  const feedbackMatch = raw.match(/FEEDBACK:\s*(.+)/);
  const feedback = feedbackMatch?.[1]?.trim() ?? raw.slice(0, 200);

  return { accuracy, completeness, voice, usefulness, overall, feedback };
}

function computeVerdict(overallNormalized: number): 'PASS' | 'WARN' | 'FAIL' {
  if (overallNormalized >= 0.7) return 'PASS';
  if (overallNormalized >= 0.5) return 'WARN';
  return 'FAIL';
}

// ---- CRUD ----

export async function createTestCase(tc: {
  name: string;
  suite_name: string;
  agent_id?: string | null;
  input_prompt: string;
  expected_behavior?: string | null;
  tags?: string[];
}): Promise<EvalTestCase> {
  const { data, error } = await supabase
    .from('eval_test_cases')
    .insert({
      name: tc.name,
      suite_name: tc.suite_name || 'default',
      agent_id: tc.agent_id || null,
      input_prompt: tc.input_prompt,
      expected_behavior: tc.expected_behavior || null,
      tags: tc.tags || [],
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to create test case: ${error.message}`);
  return data as EvalTestCase;
}

export async function listTestCases(suiteName?: string): Promise<EvalTestCase[]> {
  let query = supabase.from('eval_test_cases').select('*').order('created_at', { ascending: false });
  if (suiteName && suiteName !== 'all') {
    query = query.eq('suite_name', suiteName);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Failed to list test cases: ${error.message}`);
  return (data ?? []) as EvalTestCase[];
}

export async function deleteTestCase(id: string): Promise<void> {
  const { error } = await supabase.from('eval_test_cases').delete().eq('id', id);
  if (error) throw new Error(`Failed to delete test case: ${error.message}`);
}

// ---- Run evaluation ----

export async function runEvaluation(
  testCase: EvalTestCase,
  agentConfig: AgentConfig
): Promise<EvalRun> {
  const agentId = testCase.agent_id ?? 'generic';
  const employee = testCase.agent_id ? getEmployeeById(testCase.agent_id) : null;
  const systemPrompt = employee?.systemPrompt ?? 'You are a helpful AI assistant. Respond professionally and concisely.';

  // 1. Run agent via traced call
  const traced = await tracedLLMCall({
    provider: agentConfig.provider,
    model: agentConfig.model,
    systemPrompt,
    messages: [{ role: 'user', content: testCase.input_prompt }],
    temperature: 0.7,
    maxTokens: 1024,
    agentId,
    agentName: employee?.name ?? agentId,
  });

  // 2. Run judge LLM for scoring
  let scores = { accuracy: 0, completeness: 0, voice: 0, usefulness: 0, overall: 0, feedback: 'Judge unavailable' };
  try {
    const judgeInput = testCase.expected_behavior
      ? `Original request: ${testCase.input_prompt}\n\nExpected behavior: ${testCase.expected_behavior}\n\nAgent output to evaluate:\n${traced.output}`
      : `Original request: ${testCase.input_prompt}\n\nAgent output to evaluate:\n${traced.output}`;

    const judgeResult = await callLLM({
      provider: MODEL_CONFIG.judge.provider,
      model: MODEL_CONFIG.judge.model,
      systemPrompt: EVAL_JUDGE_PROMPT,
      messages: [{ role: 'user', content: judgeInput }],
      temperature: 0.1,
      maxTokens: 300,
    });
    scores = parseJudgeOutput(judgeResult.output);

    // Record scores in LangFuse
    const scoreNames = ['accuracy', 'completeness', 'voice', 'usefulness', 'overall'] as const;
    for (const name of scoreNames) {
      const val = name === 'overall' ? scores.overall / 100 : scores[name] / 25;
      await langfuse.createScore({
        id: crypto.randomUUID(),
        traceId: traced.traceId,
        name: `eval-${name}`,
        value: val,
        comment: name === 'overall' ? scores.feedback : undefined,
      });
    }
  } catch (err) {
    console.warn('[evalService] judge call failed', err);
  }

  const overallNormalized = scores.overall / 100;
  const verdict = computeVerdict(overallNormalized);

  // 3. Persist to Supabase
  const run = {
    test_case_id: testCase.id,
    agent_id: agentId,
    provider: agentConfig.provider,
    model: agentConfig.model,
    input_prompt: testCase.input_prompt,
    output: traced.output,
    trace_id: traced.traceId,
    latency_ms: traced.latencyMs,
    token_count: traced.usage.totalTokens,
    accuracy_score: scores.accuracy / 25,
    completeness_score: scores.completeness / 25,
    voice_score: scores.voice / 25,
    usefulness_score: scores.usefulness / 25,
    overall_score: overallNormalized,
    judge_feedback: scores.feedback,
    verdict,
  };

  const { data, error } = await supabase.from('eval_runs').insert(run).select().single();
  if (error) throw new Error(`Failed to save eval run: ${error.message}`);
  return data as EvalRun;
}

export async function runSuite(
  suiteName: string,
  agentConfig: AgentConfig,
  onProgress?: (completed: number, total: number) => void
): Promise<EvalRun[]> {
  const testCases = await listTestCases(suiteName);
  const results: EvalRun[] = [];
  for (let i = 0; i < testCases.length; i++) {
    const result = await runEvaluation(testCases[i], agentConfig);
    results.push(result);
    onProgress?.(i + 1, testCases.length);
  }
  return results;
}

// ---- Query results ----

export async function listEvalRuns(filters?: {
  suiteName?: string;
  agentId?: string;
  verdict?: string;
  limit?: number;
}): Promise<EvalRun[]> {
  let query = supabase
    .from('eval_runs')
    .select('*, test_case:eval_test_cases(*)')
    .order('created_at', { ascending: false })
    .limit(filters?.limit ?? 100);

  if (filters?.agentId) query = query.eq('agent_id', filters.agentId);
  if (filters?.verdict) query = query.eq('verdict', filters.verdict);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list eval runs: ${error.message}`);

  let runs = (data ?? []) as EvalRun[];

  // Filter by suite name client-side (joined table filter)
  if (filters?.suiteName && filters.suiteName !== 'all') {
    runs = runs.filter((r) => r.test_case?.suite_name === filters.suiteName);
  }

  return runs;
}

export async function getEvalStats(suiteName?: string): Promise<EvalStats> {
  const runs = await listEvalRuns({ suiteName, limit: 500 });
  const totalRuns = runs.length;
  if (totalRuns === 0) {
    return { totalRuns: 0, passCount: 0, warnCount: 0, failCount: 0, passRate: 0, avgScore: 0, avgLatency: 0 };
  }

  const passCount = runs.filter((r) => r.verdict === 'PASS').length;
  const warnCount = runs.filter((r) => r.verdict === 'WARN').length;
  const failCount = runs.filter((r) => r.verdict === 'FAIL').length;
  const passRate = totalRuns > 0 ? (passCount / totalRuns) * 100 : 0;

  const scoresArr = runs.map((r) => r.overall_score).filter((s): s is number => s != null);
  const avgScore = scoresArr.length > 0 ? scoresArr.reduce((a, b) => a + b, 0) / scoresArr.length : 0;

  const latArr = runs.map((r) => r.latency_ms).filter((l): l is number => l != null);
  const avgLatency = latArr.length > 0 ? Math.round(latArr.reduce((a, b) => a + b, 0) / latArr.length) : 0;

  return { totalRuns, passCount, warnCount, failCount, passRate, avgScore, avgLatency };
}

export async function listSuiteNames(): Promise<string[]> {
  const { data, error } = await supabase
    .from('eval_test_cases')
    .select('suite_name');
  if (error) return ['default'];
  const names = new Set((data ?? []).map((r: { suite_name: string }) => r.suite_name));
  return Array.from(names).sort();
}
