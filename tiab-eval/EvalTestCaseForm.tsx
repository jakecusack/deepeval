// Dialog form for creating/editing evaluation test cases

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { employeeData } from '@/data/employeeData';

interface EvalTestCaseFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    name: string;
    suite_name: string;
    agent_id: string | null;
    input_prompt: string;
    expected_behavior: string | null;
    tags: string[];
  }) => void;
  suiteNames: string[];
}

export function EvalTestCaseForm({ open, onOpenChange, onSubmit, suiteNames }: EvalTestCaseFormProps) {
  const [name, setName] = useState('');
  const [suiteName, setSuiteName] = useState('default');
  const [customSuite, setCustomSuite] = useState('');
  const [agentId, setAgentId] = useState<string>('any');
  const [inputPrompt, setInputPrompt] = useState('');
  const [expectedBehavior, setExpectedBehavior] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [useCustomSuite, setUseCustomSuite] = useState(false);

  const agents = employeeData.filter((e) => e.type === 'ai-agent');

  function handleSubmit() {
    const finalSuite = useCustomSuite ? customSuite.trim() : suiteName;
    if (!name.trim() || !inputPrompt.trim() || !finalSuite) return;

    onSubmit({
      name: name.trim(),
      suite_name: finalSuite,
      agent_id: agentId === 'any' ? null : agentId,
      input_prompt: inputPrompt.trim(),
      expected_behavior: expectedBehavior.trim() || null,
      tags: tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    });

    // Reset
    setName('');
    setSuiteName('default');
    setCustomSuite('');
    setAgentId('any');
    setInputPrompt('');
    setExpectedBehavior('');
    setTagsInput('');
    setUseCustomSuite(false);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Test Case</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="tc-name">Name</Label>
            <Input
              id="tc-name"
              placeholder="e.g. Greet user professionally"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <Label>Suite</Label>
            <div className="flex gap-2">
              {!useCustomSuite ? (
                <Select value={suiteName} onValueChange={setSuiteName}>
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(suiteNames.length > 0 ? suiteNames : ['default']).map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder="New suite name"
                  value={customSuite}
                  onChange={(e) => setCustomSuite(e.target.value)}
                  className="flex-1"
                />
              )}
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setUseCustomSuite(!useCustomSuite)}
              >
                {useCustomSuite ? 'Existing' : 'New'}
              </Button>
            </div>
          </div>

          <div>
            <Label>Agent (optional)</Label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any agent</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} -- {a.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="tc-prompt">Input Prompt</Label>
            <Textarea
              id="tc-prompt"
              placeholder="The prompt to send to the agent"
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="tc-expected">Expected Behavior (optional)</Label>
            <Textarea
              id="tc-expected"
              placeholder="Describe what good output looks like"
              value={expectedBehavior}
              onChange={(e) => setExpectedBehavior(e.target.value)}
              rows={2}
            />
          </div>

          <div>
            <Label htmlFor="tc-tags">Tags (comma-separated)</Label>
            <Input
              id="tc-tags"
              placeholder="greeting, tone, safety"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || !inputPrompt.trim()}>
            Create Test Case
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
