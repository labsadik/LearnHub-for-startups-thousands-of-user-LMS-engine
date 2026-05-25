import { useEffect, useState, useCallback, useRef, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Loader2, Clock, Trophy, CheckCircle2, XCircle,
  ChevronLeft, ChevronRight, X, AlertTriangle,
  ArrowLeft, Target, RotateCcw, BookOpen,
  Maximize2, User, Menu
} from 'lucide-react';
import { toast } from 'sonner';
import { useSEO } from '@/lib/seo';
import { cn } from '@/lib/utils';

/* ════════════════════════════════════════════════════════
   Types
   ════════════════════════════════════════════════════════ */
interface Test {
  id: string;
  title: string;
  duration_minutes: number;
  pass_score: number;
  [k: string]: unknown;
}

interface Question {
  id: string;
  text: string;
  image_url: string | null;
  marks: number;
  question_options: { id: string; text: string; is_correct: boolean; position: number }[];
}

interface Result {
  score: number; total: number; pct: number; passed: boolean; correct: number; wrong: number; coins_delta: number; xp_delta: number; locked: boolean;
}

interface UserProfile { display_name: string | null; avatar_url: string | null; }

/* ════════════════════════════════════════════════════════
   Helpers
   ════════════════════════════════════════════════════════ */
const enterFullscreen = () => {
  const elem = document.documentElement;
  if (elem.requestFullscreen) elem.requestFullscreen();
  // @ts-ignore
  else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
};

const exitFullscreen = () => {
  if (document.exitFullscreen) document.exitFullscreen();
  // @ts-ignore
  else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
};

/* ════════════════════════════════════════════════════════
   Sub-Components
   ════════════════════════════════════════════════════════ */

const TimerDisplay = memo(({ seconds }: { seconds: number }) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return (
    <div className={cn(
      "flex items-center gap-2 font-mono px-3 py-1.5 rounded-lg border text-sm font-bold transition-all",
      seconds < 60 ? "bg-red-500/10 border-red-500/30 text-red-600 animate-pulse" :
      seconds < 300 ? "bg-amber-500/10 border-amber-500/30 text-amber-600" :
      "bg-muted/50 border-border text-foreground"
    )}>
      <Clock className="w-4 h-4" />
      {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
    </div>
  );
});

// Fixed Component: Added isMobile to props
const QuestionPalette = memo(({
  questions, answers, currentQ, onSelect, onClose, profile, userId, onSubmit, isMobile
}: {
  questions: Question[];
  answers: Record<string, string>;
  currentQ: number;
  onSelect: (idx: number) => void;
  onClose?: () => void;
  profile: UserProfile | null;
  userId: string;
  onSubmit: () => void;
  isMobile?: boolean;
}) => {
  const answeredCount = Object.keys(answers).length;
  const notAnswered = questions.length - answeredCount;

  return (
    <div className="flex flex-col h-full bg-card border-l border-border/50">
      {/* Header / Profile */}
      <div className="p-5 border-b border-border/50 bg-muted/30 shrink-0">
        <div className="flex items-center justify-between mb-4">
           <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden border border-border">
               {profile?.avatar_url ? <img src={profile.avatar_url} className="w-full h-full object-cover" alt="Profile" /> : <User className="w-5 h-5 text-primary"/>}
             </div>
             <div>
               <p className="text-sm font-semibold text-foreground">{profile?.display_name || 'Candidate'}</p>
               <p className="text-xs text-muted-foreground font-mono">ID: {userId.substring(0, 8).toUpperCase()}</p>
             </div>
           </div>
           {/* Conditionally render Close button for Mobile */}
           {isMobile && onClose && (
             <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={onClose}>
               <X className="w-5 h-5" />
             </Button>
           )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
            <span className="block font-bold text-primary text-base">{answeredCount}</span>
            <span className="text-muted-foreground">Answered</span>
          </div>
          <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <span className="block font-bold text-orange-600 text-base">{notAnswered}</span>
            <span className="text-muted-foreground">Skipped</span>
          </div>
           <div className="p-2 rounded-lg bg-muted border border-border">
             <span className="block font-bold text-foreground text-base">{questions.length}</span>
             <span className="text-muted-foreground">Total</span>
           </div>
        </div>
      </div>

      {/* Question Grid */}
      <div className="flex-1 overflow-y-auto p-5">
        <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Question Navigator</p>
        <div className="grid grid-cols-5 gap-2">
          {questions.map((q, i) => {
            const isAnswered = !!answers[q.id];
            const isCurrent = i === currentQ;
            return (
              <button
                key={q.id}
                onClick={() => { onSelect(i); if(isMobile && onClose) onClose(); }}
                className={cn(
                  "aspect-square rounded-md text-sm font-bold transition-all relative focus:z-10",
                  "border border-border",
                  isCurrent && "ring-2 ring-primary ring-offset-2 ring-offset-background z-10 scale-105 shadow-sm",
                  isAnswered ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
                )}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer Action - Only for Mobile */}
      {isMobile && onClose && (
        <div className="p-4 border-t border-border/50 bg-background shrink-0">
          <Button onClick={onSubmit} className="w-full h-12 text-base bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold shadow-md">
            <CheckCircle2 className="w-5 h-5 mr-2" /> Submit Test
          </Button>
        </div>
      )}
    </div>
  );
});

const ReviewCard = memo(({ question, index, selectedOptionId }: { question: Question; index: number; selectedOptionId?: string }) => {
  const correctOpt = question.question_options.find(o => o.is_correct);
  const yourOpt = question.question_options.find(o => o.id === selectedOptionId);
  const isCorrect = yourOpt?.id === correctOpt?.id;
  const isSkipped = !selectedOptionId;

  return (
    <div className={cn(
      "rounded-xl border p-5 transition-colors",
      isCorrect ? "border-green-300/50 bg-green-50/40 dark:bg-green-950/10" :
      isSkipped ? "border-border/40 bg-card" : "border-red-300/50 bg-red-50/40 dark:bg-red-950/10"
    )}>
      <div className="flex items-start gap-3 mb-3">
        <span className="text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-md shrink-0 mt-0.5">
          Q{index + 1}
        </span>
        <p className="text-sm font-medium text-foreground leading-relaxed flex-1 break-words">{question.text}</p>
        <div className="shrink-0 mt-0.5">
          {isCorrect ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : isSkipped ? <AlertTriangle className="w-5 h-5 text-muted-foreground/40" /> : <XCircle className="w-5 h-5 text-red-500" />}
        </div>
      </div>
      <div className="ml-9 space-y-1.5 text-sm">
        {!isCorrect && (
          <div className={cn("flex items-start gap-2 px-3 py-2 rounded-lg", isSkipped ? "bg-muted/40 text-muted-foreground italic" : "bg-red-100/60 text-red-600")}>
            <span className="font-medium shrink-0">Your answer:</span>
            <span>{yourOpt?.text || "Skipped"}</span>
          </div>
        )}
        {(!isCorrect || !isSkipped) && correctOpt && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-green-100/60 text-green-600">
            <span className="font-medium shrink-0">Correct:</span>
            <span>{correctOpt.text}</span>
          </div>
        )}
      </div>
    </div>
  );
});

const ConfirmDialog = ({ open, onConfirm, onCancel, title, description, confirmText = "Submit", variant = "default" }: any) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-card border border-border/50 rounded-2xl p-6 w-full max-w-sm shadow-xl" style={{ animation: 'scaleIn .2s ease-out' }}>
        <h3 className="font-semibold text-lg text-foreground mb-1.5">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed mb-6">{description}</p>
        <div className="flex flex-col-reverse sm:flex-row gap-2">
          <Button variant="outline" onClick={onCancel} className="w-full h-11 text-sm">Cancel</Button>
          <Button onClick={onConfirm} className={cn("w-full h-11 text-sm", variant === "warning" && "bg-amber-600 hover:bg-amber-700 text-white")}>{confirmText}</Button>
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════════════
   MAIN TEST PAGE
   ════════════════════════════════════════════════════════ */
const TestPage = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const nav = useNavigate();

  const [test, setTest] = useState<Test | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isExamMode, setIsExamMode] = useState(false);
  const [showMobilePalette, setShowMobilePalette] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const submitRef = useRef<(force?: boolean) => Promise<void>>();

  useSEO({ title: test ? `${test.title} — Test` : 'Test', description: 'Assessment' });

  /* ── Load Data ── */
  const loadTest = useCallback(async (forceFresh = false) => {
    if (!user || !id) return;
    setLoading(true);
    setIsExamMode(false);

    const { data: pData } = await supabase.from('profiles').select('display_name, avatar_url').eq('user_id', user.id).maybeSingle();
    if (pData) setUserProfile(pData);

    const { data: t } = await supabase.from('tests').select('*').eq('id', id).maybeSingle();
    if (!t) { toast.error('Test not found'); nav(-1); return; }
    setTest(t as Test);

    const { data: qs } = await supabase.from('questions').select('*, question_options(*)').eq('test_id', id).order('position');
    const sorted = (qs || []).map((q: any) => ({ ...q, question_options: (q.question_options || []).sort((a: any, b: any) => a.position - b.position) })) as Question[];
    setQuestions(sorted);
    setSecondsLeft((t as Test).duration_minutes * 60);
    setAnswers({});

    if (!forceFresh) {
      const { data: last } = await supabase.from('test_attempts').select('*').eq('user_id', user.id).eq('test_id', id).not('finished_at', 'is', null).order('finished_at', { ascending: false }).limit(1).maybeSingle();
      if (last) {
        const { data: ans } = await supabase.from('test_answers').select('question_id, selected_option_id, is_correct').eq('attempt_id', last.id);
        const map: Record<string, string> = {};
        let c = 0, w = 0;
        (ans || []).forEach((a: any) => { if (a.selected_option_id) map[a.question_id] = a.selected_option_id; a.is_correct ? c++ : w++; });
        setAnswers(map);
        setResult({ score: last.score, total: last.total, pct: Math.round((last.score / last.total) * 100), passed: last.passed, correct: c, wrong: w, coins_delta: 0, xp_delta: 0, locked: true });
      }
    }
    setLoading(false);
  }, [id, user, nav]);

  /* ── Submit ── */
  const submit = useCallback(async (force = false) => {
    if (!user || !test || submitting) return;
    if (!force && Object.keys(answers).length < questions.length) { setShowConfirm(true); return; }
    
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('grade-test', { body: { test_id: test.id, answers } });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      
      exitFullscreen();
      setIsExamMode(false);
      setResult(data);
      toast.success('Test submitted!');
    } catch (e: any) {
      toast.error(e.message || 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }, [user, test, answers, questions.length, submitting]);

  submitRef.current = submit;

  /* ── Effects ── */
  useEffect(() => { loadTest(false); }, [loadTest]);

  useEffect(() => {
    if (result || secondsLeft <= 0 || loading || !isExamMode) { if (timerRef.current) clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => setSecondsLeft(s => s <= 1 ? 0 : s - 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [result, loading, isExamMode, secondsLeft]);

  useEffect(() => {
    if (!loading && !result && secondsLeft === 0 && test && isExamMode) {
      toast.warning('Time up!');
      submitRef.current?.(true);
    }
  }, [secondsLeft, loading, result, test, isExamMode]);

  /* ── Handlers ── */
  const selectAnswer = useCallback((qid: string, oid: string) => {
    setAnswers(p => ({ ...p, [qid]: p[qid] === oid ? undefined as any : oid }));
  }, []);

  const handleExit = useCallback(() => {
    exitFullscreen();
    nav(-1);
  }, [nav]);

  /* ══════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════ */
  
  const renderLoader = (message: string) => (
     <div className="fixed inset-0 z-[100] bg-background/90 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
        <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-muted"></div>
            <div className="absolute top-0 left-0 w-16 h-16 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
        </div>
        <p className="text-base font-semibold text-foreground">{message}</p>
     </div>
  );

  if (loading) return renderLoader('Preparing your test...');
  if (!test) return null;

  if (result) {
    return (
      <div className="flex-1 overflow-y-auto bg-muted/10 p-4 sm:p-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <Card className={cn("p-8 text-center border-0 shadow-lg rounded-2xl overflow-hidden relative", result.passed ? "bg-white dark:bg-card" : "bg-white dark:bg-card")}>
             <div className={cn("absolute top-0 left-0 right-0 h-3", result.passed ? "bg-green-500" : "bg-red-500")} />
             
            <div className={cn("w-24 h-24 rounded-full mx-auto mb-5 flex items-center justify-center shadow-inner", result.passed ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30")}>
              {result.passed ? <Trophy className="w-12 h-12 text-green-600" /> : <XCircle className="w-12 h-12 text-red-600" />}
            </div>
            <h2 className="text-4xl font-extrabold text-foreground mb-1">{result.score} <span className="text-xl text-muted-foreground font-normal">/ {result.total}</span></h2>
            <p className="text-muted-foreground text-base mb-5">{result.pct}% Score · Pass Mark: {test.pass_score}%</p>
            
            <div className="flex justify-center gap-8 mb-6 py-5 border-y border-border/50 text-sm">
              <div className="text-center">
                <span className="block text-2xl font-bold text-green-600">{result.correct}</span>
                <span className="text-muted-foreground uppercase font-medium">Correct</span>
              </div>
              <div className="text-center">
                <span className="block text-2xl font-bold text-red-600">{result.wrong}</span>
                <span className="text-muted-foreground uppercase font-medium">Wrong</span>
              </div>
              <div className="text-center">
                <span className="block text-2xl font-bold text-muted-foreground">{questions.length - result.correct - result.wrong}</span>
                <span className="text-muted-foreground uppercase font-medium">Skipped</span>
              </div>
            </div>

            <div className="flex gap-3 justify-center">
              <Button variant="outline" size="lg" onClick={() => nav(-1)} className="gap-2 rounded-xl"><ArrowLeft className="w-5 h-5"/>Back</Button>
              <Button size="lg" onClick={() => { setResult(null); loadTest(true); setIsExamMode(true); enterFullscreen(); }} className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl"><RotateCcw className="w-5 h-5"/>Reattempt</Button>
            </div>
          </Card>

          <div className="space-y-4">
             <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2 px-1"><BookOpen className="w-4 h-4"/> Answer Review</h3>
            {questions.map((q, i) => <ReviewCard key={q.id} question={q} index={i} selectedOptionId={answers[q.id]} />)}
          </div>
        </div>
      </div>
    );
  }

  if (!isExamMode) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-gradient-to-b from-background to-muted p-4">
        <Card className="w-full max-w-md p-8 text-center space-y-5 shadow-xl border-border/50 rounded-2xl">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto shadow-inner">
            <BookOpen className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">{test.title}</h1>
          <p className="text-sm text-muted-foreground">Read instructions carefully.</p>
          
          <div className="bg-muted/50 rounded-xl p-5 text-left space-y-3 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Duration</span>
              <span className="font-bold text-foreground">{test.duration_minutes} Min</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Questions</span>
              <span className="font-bold text-foreground">{questions.length}</span>
            </div>
          </div>

          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 text-amber-700 text-sm p-4 rounded-lg text-left flex gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>Fullscreen mode enabled. Do not refresh.</span>
          </div>
          
          <Button onClick={() => { enterFullscreen(); setIsExamMode(true); }} className="w-full h-14 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold text-lg rounded-xl shadow-lg">
            <Maximize2 className="w-5 h-5 mr-2"/> Start Test
          </Button>
        </Card>
      </div>
    );
  }

  const q = questions[currentQ];
  if (!q) return null;

  return (
    <div className="fixed inset-0 z-30 bg-muted/10 flex flex-col overflow-hidden">
      
      {submitting && renderLoader('Submitting...')}

      <header className="h-16 bg-white dark:bg-card border-b border-border/50 flex items-center justify-between px-4 sm:px-6 shrink-0 z-20">
        <div className="flex items-center gap-3">
           <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full text-muted-foreground hover:text-destructive" onClick={() => setShowExitConfirm(true)}>
             <X className="w-5 h-5" />
           </Button>
           <div className="border-l border-border pl-3 ml-1">
             <span className="text-sm font-bold text-foreground block truncate max-w-[150px] sm:max-w-none">{test.title}</span>
             <span className="text-[11px] text-muted-foreground">Assessment Mode</span>
           </div>
        </div>
        <div className="flex items-center gap-4">
            <TimerDisplay seconds={secondsLeft} />
            <div className="hidden sm:flex items-center gap-2 pl-4 border-l border-border">
                <div className="text-right">
                    <p className="text-[11px] text-muted-foreground">Candidate</p>
                    <p className="text-sm font-semibold truncate max-w-[100px]">{userProfile?.display_name}</p>
                </div>
                <div className="w-9 h-9 rounded-full bg-muted overflow-hidden">
                    {userProfile?.avatar_url ? <img src={userProfile.avatar_url} className="w-full h-full object-cover" /> : <User className="w-5 h-5 m-auto mt-2 text-muted-foreground"/>}
                </div>
            </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 flex flex-col min-w-0 overflow-y-auto bg-white dark:bg-background">
            <div className="flex-1 flex flex-col justify-center p-4 sm:p-6 lg:p-8">
                <div className="max-w-3xl w-full mx-auto space-y-5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                        <span className="bg-primary/10 text-primary px-2.5 py-1 rounded text-sm">Question No. {currentQ + 1}</span>
                        <span className="flex items-center gap-1 text-sm"><Target className="w-4 h-4"/> Marks: {q.marks}</span>
                    </div>

                    <div className="bg-card border border-border/50 rounded-2xl p-6 sm:p-8 shadow-sm">
                        <p className="font-medium text-base sm:text-lg leading-relaxed text-foreground mb-6">{q.text}</p>
                        {q.image_url && (
                            <div className="mb-6 p-2 bg-muted/30 rounded-lg inline-block max-w-full">
                                <img src={q.image_url} alt="Question" className="max-h-60 rounded-md max-w-full" />
                            </div>
                        )}
                        
                        <div className="space-y-3">
                            {q.question_options.map((opt, i) => {
                            const isSelected = answers[q.id] === opt.id;
                            return (
                                <button
                                    key={opt.id}
                                    onClick={() => selectAnswer(q.id, opt.id)}
                                    className={cn(
                                        "w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all group",
                                        "focus-visible:ring-2 focus-visible:ring-primary",
                                        isSelected 
                                            ? "bg-primary/5 border-primary/40 shadow-sm" 
                                            : "border-border/70 hover:bg-muted/30"
                                    )}
                                >
                                    <span className={cn(
                                        "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0",
                                        isSelected ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground"
                                    )}>
                                        {String.fromCharCode(65 + i)}
                                    </span>
                                    <span className="text-sm sm:text-base flex-1 text-foreground/90">{opt.text}</span>
                                    {isSelected && <CheckCircle2 className="w-6 h-6 text-primary ml-auto shrink-0" />}
                                </button>
                            );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            <div className="hidden sm:flex border-t border-border/50 p-3 bg-muted/20 shrink-0">
                 <div className="flex items-center gap-2 max-w-3xl w-full mx-auto">
                    <Button variant="outline" size="default" className="gap-2 text-sm" disabled={currentQ === 0} onClick={() => setCurrentQ(c => c - 1)}>
                        <ChevronLeft className="w-5 h-5"/> Previous
                    </Button>
                    <div className="flex-1" />
                    {currentQ === questions.length - 1 ? (
                        <Button size="default" onClick={() => submit(false)} disabled={submitting} className="gap-2 bg-green-600 hover:bg-green-700 text-white text-sm">
                            <CheckCircle2 className="w-5 h-5"/> Submit Test
                        </Button>
                    ) : (
                        <Button size="default" className="gap-2 text-sm" onClick={() => setCurrentQ(c => c + 1)}>
                            Save & Next <ChevronRight className="w-5 h-5"/>
                        </Button>
                    )}
                 </div>
            </div>
        </main>

        <aside className="hidden lg:block w-72 shrink-0 border-l border-border/50 h-full bg-muted/5">
            <QuestionPalette
                questions={questions} answers={answers} currentQ={currentQ} onSelect={setCurrentQ}
                profile={userProfile} userId={user?.id||''} onSubmit={() => submit(false)}
            />
        </aside>
      </div>

      <nav className="sm:hidden shrink-0 border-t border-border/50 bg-white dark:bg-background p-2 flex items-center gap-2 justify-between sticky bottom-0 z-20">
          <Button variant="outline" size="default" className="h-11 px-3 text-sm flex-1" disabled={currentQ === 0} onClick={() => setCurrentQ(c => c - 1)}>
             <ChevronLeft className="w-4 h-4 mr-1"/> Prev
          </Button>

          <Button variant="outline" className="h-11 px-3 text-sm font-bold flex-1 bg-muted/40" onClick={() => setShowMobilePalette(true)}>
             <Menu className="w-4 h-4 mr-1.5"/> Menu
             <span className="ml-2 px-1.5 py-0.5 rounded bg-primary text-primary-foreground text-[11px]">{Object.keys(answers).length}/{questions.length}</span>
          </Button>

          {currentQ === questions.length - 1 ? (
              <Button size="default" className="h-11 px-3 text-sm flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold" onClick={() => submit(false)} disabled={submitting}>
                  <CheckCircle2 className="w-4 h-4 mr-1"/> Submit
              </Button>
          ) : (
              <Button size="default" className="h-11 px-3 text-sm flex-1 font-semibold" onClick={() => setCurrentQ(c => c + 1)}>
                  Next <ChevronRight className="w-4 h-4 ml-1"/>
              </Button>
          )}
      </nav>

      {showMobilePalette && (
        <div className="lg:hidden fixed inset-0 z-50" style={{animation: 'fadeIn .2s ease-out'}}>
           <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowMobilePalette(false)} />
           <div className="absolute right-0 top-0 bottom-0 w-full max-w-xs shadow-2xl" style={{animation: 'slideIn .25s ease-out'}}>
             <QuestionPalette
               questions={questions} answers={answers} currentQ={currentQ} onSelect={setCurrentQ}
               isMobile={true}
               onClose={() => setShowMobilePalette(false)} profile={userProfile} userId={user?.id||''}
               onSubmit={() => { setShowMobilePalette(false); submit(false); }}
             />
           </div>
        </div>
      )}

      <ConfirmDialog open={showConfirm} onConfirm={() => submit(true)} onCancel={() => setShowConfirm(false)} title="Submit Test?" description="You have unanswered questions." confirmText="Submit Anyway" variant="warning" />
      <ConfirmDialog open={showExitConfirm} onConfirm={handleExit} onCancel={() => setShowExitConfirm(false)} title="Exit Test?" description="Your progress will be lost." confirmText="Exit Anyway" variant="warning" />
      
      <style>{`
        @keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
      `}</style>
    </div>
  );
};

export default TestPage;