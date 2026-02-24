// Deep Evaluation Dashboard -- test suites, judge scoring, pass/fail analytics

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Clock,
  FlaskConical,
  Play,
  Plus,
  RefreshCw,
  Target,
  Trash2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EvalTestCaseForm } from '@/components/EvalTestCaseForm';
import {
  listTestCases,
  listEvalRuns,
  getEvalStats,
  listSuiteNames,
  runEvaluation,
  runSuite,
  deleteTestCase,
  createTestCase,
  type EvalTestCase,
  type EvalRun,
  type EvalStats,
  type AgentConfig,
} from '@/services/evalService';
import { MODEL_CONFIG, getAvailableProviders } from '@/services/modelConfig';

// ---- Verdict colors ----

const VERDICT_STYLES: Record<string, { bg: string; text: string }> = {
  PASS: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  WARN: { bg: 'bg-amber-100', text: 'text-amber-700' },
  FAIL: { bg: 'bg-red-100', text: 'text-red-700' },
};

const PIE_COLORS = ['#10b981', '#f59e0b', '#ef4444'];

// ---- Default agent config ----

const DEFAULT_CONFIG: AgentConfig = {
  provider: MODEL_CONFIG.chat.provider,
  model: MODEL_CONFIG.chat.model,
};

const AVAILABLE_PROVIDERS = getAvailableProviders();

// ---- Component ----

export function EvaluationDashboard() {
  const [testCases, setTestCases] = useState<EvalTestCase[]>([]);
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [stats, setStats] = useState<EvalStats | null>(null);
  const [suiteNames, setSuiteNames] = useState<string[]>(['default']);
  const [selectedSuite, setSelectedSuite] = useState('all');
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runningSuite, setRunningSuite] = useState(false);
  const [suiteProgress, setSuiteProgress] = useState<{ done: number; total: number } | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [agentConfig, setAgentConfig] = useState<AgentConfig>(DEFAULT_CONFIG);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const suite = selectedSuite === 'all' ? undefined : selectedSuite;
      const [tc, r, s, names] = await Promise.all([
        listTestCases(suite),
        listEvalRuns({ suiteName: suite }),
        getEvalStats(suite),
        listSuiteNames(),
      ]);
      setTestCases(tc);
      setRuns(r);
      setStats(s);
      setSuiteNames(names.length > 0 ? names : ['default']);
    } catch (err) {
      console.warn('[EvaluationDashboard] fetch error', err);
    }
    setLoading(false);
  }, [selectedSuite]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---- Handlers ----

  async function handleCreateTestCase(data: Parameters<typeof createTestCase>[0]) {
    await createTestCase(data);
    await fetchData();
  }

  async function handleDeleteTestCase(id: string) {
    await deleteTestCase(id);
    await fetchData();
  }

  async function handleRunSingle(tc: EvalTestCase) {
    setRunningId(tc.id);
    try {
      await runEvaluation(tc, agentConfig);
      await fetchData();
    } catch (err) {
      console.error('[EvaluationDashboard] run failed', err);
    }
    setRunningId(null);
  }

  async function handleRunSuite() {
    const suite = selectedSuite === 'all' ? 'default' : selectedSuite;
    setRunningSuite(true);
    setSuiteProgress({ done: 0, total: testCases.length });
    try {
      await runSuite(suite, agentConfig, (done, total) => {
        setSuiteProgress({ done, total });
      });
      await fetchData();
    } catch (err) {
      console.error('[EvaluationDashboard] suite run failed', err);
    }
    setRunningSuite(false);
    setSuiteProgress(null);
  }

  // ---- Chart data ----

  const verdictDistribution = useMemo(() => {
    if (!stats) return [];
    return [
      { name: 'Pass', value: stats.passCount },
      { name: 'Warn', value: stats.warnCount },
      { name: 'Fail', value: stats.failCount },
    ].filter((d) => d.value > 0);
  }, [stats]);

  const scoresByAgent = useMemo(() => {
    const m = new Map<string, { sum: number; count: number }>();
    for (const r of runs) {
      if (r.overall_score == null) continue;
      const existing = m.get(r.agent_id) ?? { sum: 0, count: 0 };
      existing.sum += r.overall_score;
      existing.count++;
      m.set(r.agent_id, existing);
    }
    return Array.from(m.entries())
      .map(([agent, { sum, count }]) => ({
        agent: agent.length > 14 ? agent.slice(0, 12) + '..' : agent,
        score: Math.round((sum / count) * 100),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }, [runs]);

  const dimensionRadar = useMemo(() => {
    const dims = { Accuracy: [] as number[], Completeness: [] as number[], Voice: [] as number[], Usefulness: [] as number[] };
    for (const r of runs) {
      if (r.accuracy_score != null) dims.Accuracy.push(r.accuracy_score);
      if (r.completeness_score != null) dims.Completeness.push(r.completeness_score);
      if (r.voice_score != null) dims.Voice.push(r.voice_score);
      if (r.usefulness_score != null) dims.Usefulness.push(r.usefulness_score);
    }
    return Object.entries(dims).map(([dimension, values]) => ({
      dimension,
      score: values.length > 0 ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) : 0,
    }));
  }, [runs]);

  const scoreDistribution = useMemo(() => {
    const buckets: Record<string, number> = { '0-30': 0, '30-50': 0, '50-70': 0, '70-90': 0, '90-100': 0 };
    for (const r of runs) {
      const s = (r.overall_score ?? 0) * 100;
      if (s < 30) buckets['0-30']++;
      else if (s < 50) buckets['30-50']++;
      else if (s < 70) buckets['50-70']++;
      else if (s < 90) buckets['70-90']++;
      else buckets['90-100']++;
    }
    return Object.entries(buckets).map(([range, count]) => ({ range, count }));
  }, [runs]);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="sticky top-16 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Deep Evaluation</h1>
            <p className="text-sm text-slate-600">Test prompt quality at scale with Judge LLM scoring</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={selectedSuite} onValueChange={setSelectedSuite}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Suite" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All suites</SelectItem>
                {suiteNames.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              New Test Case
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* Agent Config */}
        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="flex flex-wrap items-center gap-4 pt-6">
            <div className="flex items-center gap-2">
              <Label className="text-sm text-slate-600">Provider:</Label>
              <Select value={agentConfig.provider} onValueChange={(v) => setAgentConfig({ ...agentConfig, provider: v as AgentConfig['provider'] })}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_PROVIDERS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm text-slate-600">Model:</Label>
              <input
                type="text"
                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={agentConfig.model}
                onChange={(e) => setAgentConfig({ ...agentConfig, model: e.target.value })}
              />
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={handleRunSuite}
              disabled={runningSuite || testCases.length === 0}
            >
              <Play className="mr-1 h-3.5 w-3.5" />
              {runningSuite
                ? `Running ${suiteProgress?.done ?? 0}/${suiteProgress?.total ?? 0}...`
                : `Run Suite (${testCases.length})`}
            </Button>
          </CardContent>
        </Card>

        {/* KPI row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border border-slate-200 shadow-sm">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Total Runs</p>
                <p className="text-2xl font-bold text-slate-900">{stats?.totalRuns ?? 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border border-slate-200 shadow-sm">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <Target className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Pass Rate</p>
                <p className="text-2xl font-bold text-slate-900">
                  {stats && stats.totalRuns > 0 ? `${stats.passRate.toFixed(0)}%` : '--'}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border border-slate-200 shadow-sm">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                <FlaskConical className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Avg Score</p>
                <p className="text-2xl font-bold text-slate-900">
                  {stats && stats.avgScore > 0 ? `${(stats.avgScore * 100).toFixed(0)}%` : '--'}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border border-slate-200 shadow-sm">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-fuchsia-50 text-fuchsia-600">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Avg Latency</p>
                <p className="text-2xl font-bold text-slate-900">
                  {stats && stats.avgLatency > 0 ? `${stats.avgLatency}ms` : '--'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="test-cases">
          <TabsList>
            <TabsTrigger value="test-cases">Test Cases</TabsTrigger>
            <TabsTrigger value="results">Results</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          {/* ---- Test Cases tab ---- */}
          <TabsContent value="test-cases" className="mt-4">
            {testCases.length === 0 ? (
              <Card className="border-dashed border-slate-300">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <FlaskConical className="mb-3 h-10 w-10 text-slate-300" />
                  <p className="mb-1 font-medium text-slate-600">No test cases yet</p>
                  <p className="mb-4 text-sm text-slate-400">Create your first test case to start evaluating agent quality.</p>
                  <Button size="sm" onClick={() => setFormOpen(true)}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    New Test Case
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="border border-slate-200">
                <CardContent className="p-0">
                  <div className="max-h-[60vh] overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Name</th>
                          <th className="hidden px-4 py-3 sm:table-cell">Suite</th>
                          <th className="hidden px-4 py-3 md:table-cell">Agent</th>
                          <th className="hidden px-4 py-3 lg:table-cell">Prompt</th>
                          <th className="hidden px-4 py-3 lg:table-cell">Tags</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {testCases.map((tc) => (
                          <tr key={tc.id} className="transition-colors hover:bg-slate-50">
                            <td className="px-4 py-3 font-medium text-slate-900">{tc.name}</td>
                            <td className="hidden px-4 py-3 sm:table-cell">
                              <Badge variant="outline">{tc.suite_name}</Badge>
                            </td>
                            <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                              {tc.agent_id ?? 'Any'}
                            </td>
                            <td className="hidden max-w-[200px] truncate px-4 py-3 text-xs text-slate-500 lg:table-cell">
                              {tc.input_prompt}
                            </td>
                            <td className="hidden px-4 py-3 lg:table-cell">
                              <div className="flex flex-wrap gap-1">
                                {tc.tags.slice(0, 3).map((tag) => (
                                  <Badge key={tag} variant="secondary" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => handleRunSingle(tc)}
                                  disabled={runningId === tc.id}
                                >
                                  {runningId === tc.id ? (
                                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Play className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-red-500 hover:text-red-700"
                                  onClick={() => handleDeleteTestCase(tc.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ---- Results tab ---- */}
          <TabsContent value="results" className="mt-4">
            {runs.length === 0 ? (
              <Card className="border-dashed border-slate-300">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <Activity className="mb-3 h-10 w-10 text-slate-300" />
                  <p className="mb-1 font-medium text-slate-600">No evaluation results</p>
                  <p className="text-sm text-slate-400">Run a test case to see results here.</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="border border-slate-200">
                <CardContent className="p-0">
                  <div className="max-h-[60vh] overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                        <tr>
                          <th className="w-8 px-2 py-3" />
                          <th className="px-4 py-3">Test Case</th>
                          <th className="hidden px-4 py-3 sm:table-cell">Agent</th>
                          <th className="hidden px-4 py-3 md:table-cell">Model</th>
                          <th className="px-4 py-3">Score</th>
                          <th className="px-4 py-3">Verdict</th>
                          <th className="hidden px-4 py-3 lg:table-cell">Latency</th>
                          <th className="hidden px-4 py-3 lg:table-cell">Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {runs.map((r) => {
                          const vs = VERDICT_STYLES[r.verdict ?? 'FAIL'];
                          const expanded = expandedRunId === r.id;
                          return (
                            <>
                              <tr
                                key={r.id}
                                className="cursor-pointer transition-colors hover:bg-slate-50"
                                onClick={() => setExpandedRunId(expanded ? null : r.id)}
                              >
                                <td className="px-2 py-3 text-slate-400">
                                  {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </td>
                                <td className="px-4 py-3 font-medium text-slate-900">
                                  {r.test_case?.name ?? r.test_case_id.slice(0, 8)}
                                </td>
                                <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">{r.agent_id}</td>
                                <td className="hidden px-4 py-3 text-slate-600 md:table-cell">{r.model}</td>
                                <td className="px-4 py-3">
                                  <span className="font-mono font-semibold">
                                    {r.overall_score != null ? `${(r.overall_score * 100).toFixed(0)}%` : '--'}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <Badge className={`${vs.bg} ${vs.text}`}>
                                    {r.verdict === 'PASS' && <CheckCircle2 className="mr-1 h-3 w-3" />}
                                    {r.verdict === 'WARN' && <AlertTriangle className="mr-1 h-3 w-3" />}
                                    {r.verdict === 'FAIL' && <XCircle className="mr-1 h-3 w-3" />}
                                    {r.verdict}
                                  </Badge>
                                </td>
                                <td className="hidden px-4 py-3 font-mono text-xs lg:table-cell">
                                  {r.latency_ms != null ? `${r.latency_ms}ms` : '--'}
                                </td>
                                <td className="hidden px-4 py-3 text-xs text-slate-500 lg:table-cell">
                                  {new Date(r.created_at).toLocaleString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </td>
                              </tr>
                              {expanded && (
                                <tr key={`${r.id}-detail`}>
                                  <td colSpan={8} className="bg-slate-50 px-6 py-4">
                                    <div className="space-y-3">
                                      {/* Dimension scores */}
                                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                        {[
                                          { label: 'Accuracy', value: r.accuracy_score },
                                          { label: 'Completeness', value: r.completeness_score },
                                          { label: 'Voice', value: r.voice_score },
                                          { label: 'Usefulness', value: r.usefulness_score },
                                        ].map(({ label, value }) => (
                                          <div key={label} className="rounded-md border border-slate-200 bg-white p-2 text-center">
                                            <p className="text-xs text-slate-500">{label}</p>
                                            <p className="text-lg font-semibold">
                                              {value != null ? `${(value * 100).toFixed(0)}%` : '--'}
                                            </p>
                                          </div>
                                        ))}
                                      </div>
                                      {/* Feedback */}
                                      {r.judge_feedback && (
                                        <div>
                                          <p className="mb-1 text-xs font-medium text-slate-500">Judge Feedback</p>
                                          <p className="text-sm text-slate-700">{r.judge_feedback}</p>
                                        </div>
                                      )}
                                      {/* Input */}
                                      <div>
                                        <p className="mb-1 text-xs font-medium text-slate-500">Input</p>
                                        <pre className="max-h-24 overflow-auto rounded-md bg-white p-2 text-xs text-slate-600">
                                          {r.input_prompt}
                                        </pre>
                                      </div>
                                      {/* Output */}
                                      <div>
                                        <p className="mb-1 text-xs font-medium text-slate-500">Output</p>
                                        <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-md bg-white p-2 text-xs text-slate-600">
                                          {r.output}
                                        </pre>
                                      </div>
                                      {r.trace_id && (
                                        <p className="text-xs text-slate-400">Trace ID: {r.trace_id}</p>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ---- Analytics tab ---- */}
          <TabsContent value="analytics" className="mt-4">
            {runs.length === 0 ? (
              <Card className="border-dashed border-slate-300">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <Target className="mb-3 h-10 w-10 text-slate-300" />
                  <p className="mb-1 font-medium text-slate-600">No data for analytics</p>
                  <p className="text-sm text-slate-400">Run evaluations to see analytics charts.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Verdict distribution */}
                <Card className="border border-slate-200 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold">Verdict Distribution</CardTitle>
                    <CardDescription className="text-xs">Pass / Warn / Fail breakdown</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={verdictDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={80} label>
                          {verdictDistribution.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Score distribution */}
                <Card className="border border-slate-200 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold">Score Distribution</CardTitle>
                    <CardDescription className="text-xs">Overall score ranges</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={scoreDistribution}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Scores by agent */}
                <Card className="border border-slate-200 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold">Scores by Agent</CardTitle>
                    <CardDescription className="text-xs">Average score per agent</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={scoresByAgent} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                        <YAxis dataKey="agent" type="category" width={120} tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Bar dataKey="score" fill="#06b6d4" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Dimension radar */}
                <Card className="border border-slate-200 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold">Dimension Scores</CardTitle>
                    <CardDescription className="text-xs">Average across all runs</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <RadarChart data={dimensionRadar}>
                        <PolarGrid />
                        <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11 }} />
                        <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                        <Radar name="Score" dataKey="score" stroke="#d946ef" fill="#d946ef" fillOpacity={0.3} />
                        <Tooltip />
                      </RadarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Test case form dialog */}
      <EvalTestCaseForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleCreateTestCase}
        suiteNames={suiteNames}
      />
    </div>
  );
}

// ---- Small Label helper ----

function Label({ children, className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement> & { className?: string }) {
  return (
    <label className={`text-sm font-medium text-slate-700 ${className ?? ''}`} {...props}>
      {children}
    </label>
  );
}
