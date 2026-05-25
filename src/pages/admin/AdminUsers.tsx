import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Shield, ShieldOff, ChevronDown, ChevronRight, Search, Plus, Loader2,
  Trash2, AlertTriangle, CheckCircle2, Lock, Coins, Users as UsersIcon,
  GraduationCap, Flame, Trophy, Calendar, Mail, Phone as PhoneIcon,
  BookOpen, ClipboardCheck, Tag, Crown, UserCheck, UserX, Sparkles,
  ArrowRight, X, Eye, MapPin, Globe, User
} from 'lucide-react';

const AdminUsers = () => {
  const ADMIN_PASS = import.meta.env.VITE_ADMIN_ASSIGN_PASS;

  const [rows, setRows] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState<Record<string, any>>({});
  const [loadingDetails, setLoadingDetails] = useState<Set<string>>(new Set());
  const [allCourses, setAllCourses] = useState<any[]>([]);
  const [grantCourse, setGrantCourse] = useState<Record<string, string>>({});
  const [granting, setGranting] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  const [adminDialog, setAdminDialog] = useState<{ open: boolean; userId: string | null; currentIsAdmin: boolean }>({ open: false, userId: null, currentIsAdmin: false });
  const [adminPassInput, setAdminPassInput] = useState('');
  const [adminActionLoading, setAdminActionLoading] = useState(false);

  const detailsRef = useRef(details);
  detailsRef.current = details;
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  const load = useCallback(async () => {
    setInitialLoading(true);
    try {
      const [profilesRes, rolesRes, usersRes, coursesRes] = await Promise.all([
        // UPDATED: Removed 'bio', added new profile fields to match SQL schema
        supabase.from('profiles').select('user_id, display_name, avatar_url, phone, xp, coins, level, current_streak, longest_streak, created_at, gender, date_of_birth, language, address, city, state, country, pincode').order('created_at', { ascending: false }).limit(500),
        supabase.from('user_roles').select('user_id, role'),
        supabase.functions.invoke('admin-users'),
        supabase.from('courses').select('id, title').order('title'),
      ]);

      const profiles = profilesRes.data || [];
      const roles = rolesRes.data || [];
      const cs = coursesRes.data || [];

      let authUsers: any[] = [];
      const ud: any = usersRes.data;
      if (ud?.error) toast.error('Auth users: ' + (ud.error.message || 'unknown'), { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> });
      else authUsers = ud?.users || [];

      const adminSet = new Set(roles.filter((r: any) => r.role === 'admin').map((r: any) => r.user_id));
      const emails: Record<string, string> = {};
      authUsers.forEach((u: any) => { emails[u.id] = u.email; });

      const profileIds = new Set(profiles.map((p: any) => p.user_id));
      
      // UPDATED: Merge logic includes new fields with defaults
      const merged = [
        ...profiles.map((p: any) => ({ ...p, isAdmin: adminSet.has(p.user_id), email: emails[p.user_id] })),
        ...authUsers.filter((u: any) => !profileIds.has(u.id)).map((u: any) => ({
          user_id: u.id, display_name: null, avatar_url: null, phone: null, 
          xp: 0, coins: 0, level: 1, current_streak: 0, longest_streak: 0,
          created_at: u.created_at, isAdmin: adminSet.has(u.id), email: u.email,
          gender: null, date_of_birth: null, language: null, address: null, city: null, state: null, country: null, pincode: null
        })),
      ];

      setRows(merged);
      setAllCourses(cs);
    } catch {
      toast.error('Failed to load users', { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> });
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = useCallback(async (uid: string) => {
    const next = new Set(expandedRef.current);
    if (next.has(uid)) {
      next.delete(uid);
      setExpanded(next);
      return;
    }
    next.add(uid);
    setExpanded(next);

    if (detailsRef.current[uid]) return;

    setLoadingDetails((p) => new Set(p).add(uid));
    try {
      const [ensRes, attemptsRes, redemptionsRes] = await Promise.all([
        supabase.from('enrollments').select('id, enrolled_at, amount_paid_inr, promocode, courses(id, title, slug)').eq('user_id', uid),
        supabase.from('test_attempts').select('id, score, total, passed, finished_at, tests(title)').eq('user_id', uid).order('finished_at', { ascending: false }).limit(20),
        supabase.from('promocode_redemptions').select('id, redeemed_at, promocodes(code), courses(title)').eq('user_id', uid).order('redeemed_at', { ascending: false }),
      ]);

      const enrollments = ensRes.data || [];
      const courseIds = [...new Set(enrollments.map((e: any) => e.courses?.id).filter(Boolean))];

      let partIdMap: Record<string, string[]> = {};
      let completedPartIds = new Set<string>();

      if (courseIds.length > 0) {
        const [subsRes, progressRes] = await Promise.all([
          supabase.from('subjects').select('id, course_id, chapters(id, parts(id))').in('course_id', courseIds),
          supabase.from('progress').select('part_id').eq('user_id', uid).eq('completed', true),
        ]);

        for (const s of subsRes.data || []) {
          const parts: string[] = (s.chapters || []).flatMap((ch: any) => (ch.parts || []).map((p: any) => p.id));
          if (parts.length) partIdMap[s.course_id] = parts;
        }
        for (const p of progressRes.data || []) completedPartIds.add(p.part_id);
      }

      const items = enrollments.map((e: any) => {
        const totalParts = partIdMap[e.courses?.id] || [];
        const doneParts = totalParts.filter((pid) => completedPartIds.has(pid)).length;
        const pct = totalParts.length ? Math.round((doneParts / totalParts.length) * 100) : 0;
        return { ...e, pct, totalParts: totalParts.length, doneParts };
      });

      const totalSpent = items.reduce((s: number, e: any) => s + (e.amount_paid_inr || 0), 0);

      setDetails((prev) => ({
        ...prev,
        [uid]: { enrollments: items, attempts: attemptsRes.data || [], totalSpent, redemptions: redemptionsRes.data || [] },
      }));
    } catch {
      toast.error('Failed to load details', { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> });
    } finally {
      setLoadingDetails((p) => { const n = new Set(p); n.delete(uid); return n; });
    }
  }, []);

  const grant = async (uid: string) => {
    const cid = grantCourse[uid];
    if (!cid) { toast.error('Pick a course', { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> }); return; }
    setGranting(uid);
    try {
      const { error } = await supabase.from('enrollments').upsert(
        { user_id: uid, course_id: cid, amount_paid_inr: 0, promocode: 'ADMIN_GRANT' },
        { onConflict: 'user_id,course_id' }
      );
      if (error) throw error;
      toast.success('Course granted', { icon: <CheckCircle2 className="h-4 w-4 text-green-500" /> });
      setGrantCourse((p) => { const n = { ...p }; delete n[uid]; return n; });

      const course = allCourses.find((c) => c.id === cid);
      setDetails((prev) => {
        const d = prev[uid];
        if (!d || d.enrollments.some((e: any) => e.courses?.id === cid)) return prev;
        return {
          ...prev,
          [uid]: {
            ...d,
            enrollments: [...d.enrollments, {
              id: crypto.randomUUID(),
              enrolled_at: new Date().toISOString(),
              amount_paid_inr: 0,
              promocode: 'ADMIN_GRANT',
              courses: { id: cid, title: course?.title || cid, slug: '' },
              pct: 0, totalParts: 0, doneParts: 0
            }]
          }
        };
      });
    } catch (err: any) {
      toast.error(err.message || 'Failed to grant course', { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> });
    } finally {
      setGranting(null);
    }
  };

  const revoke = async (uid: string, enrollmentId: string) => {
    const { error } = await supabase.from('enrollments').delete().eq('id', enrollmentId);
    if (error) { toast.error('Failed to revoke', { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> }); return; }
    toast.success('Course access removed', { icon: <CheckCircle2 className="h-4 w-4 text-green-500" /> });
    setDetails((prev) => {
      const d = prev[uid];
      if (!d) return prev;
      return { ...prev, [uid]: { ...d, enrollments: d.enrollments.filter((e: any) => e.id !== enrollmentId) } };
    });
  };

  const openAdminDialog = (uid: string, isAdmin: boolean) => {
    setAdminDialog({ open: true, userId: uid, currentIsAdmin: isAdmin });
    setAdminPassInput('');
  };

  const handleAdminAction = async () => {
    if (!adminDialog.userId) return;
    if (adminPassInput !== ADMIN_PASS) {
      toast.error('Incorrect Admin Password', { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> });
      return;
    }

    setAdminActionLoading(true);
    const uid = adminDialog.userId;
    const isCurrentlyAdmin = adminDialog.currentIsAdmin;

    setRows((prev) => prev.map((u) => u.user_id === uid ? { ...u, isAdmin: !isCurrentlyAdmin } : u));

    try {
      if (isCurrentlyAdmin) {
        const { error } = await supabase.from('user_roles').delete().eq('user_id', uid).eq('role', 'admin');
        if (error) throw error;
        toast.success('Admin privileges removed', { icon: <CheckCircle2 className="h-4 w-4 text-green-500" /> });
      } else {
        const { error } = await supabase.from('user_roles').upsert(
          { user_id: uid, role: 'admin' },
          { onConflict: 'user_id,role' }
        );
        if (error) throw error;
        toast.success('User assigned as Admin', { icon: <CheckCircle2 className="h-4 w-4 text-green-500" /> });
      }
      setAdminDialog({ open: false, userId: null, currentIsAdmin: false });
    } catch (err: any) {
      toast.error(err.message || 'Action failed', { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> });
      setRows((prev) => prev.map((u) => u.user_id === uid ? { ...u, isAdmin: isCurrentlyAdmin } : u));
    } finally {
      setAdminActionLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((u) =>
      (u.display_name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.phone || '').toLowerCase().includes(q) ||
      (u.city || '').toLowerCase().includes(q) || // Added search by city
      (u.state || '').toLowerCase().includes(q)   // Added search by state
    );
  }, [rows, query]);

  const quickStats = useMemo(() => {
    const admins = rows.filter(u => u.isAdmin).length;
    const totalXp = rows.reduce((s, u) => s + (u.xp || 0), 0);
    const avgLevel = rows.length > 0 ? (rows.reduce((s, u) => s + (u.level || 1), 0) / rows.length).toFixed(1) : '0';
    return { admins, totalXp, avgLevel };
  }, [rows]);

  if (initialLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 h-full gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 animate-pulse">
          <UsersIcon className="w-6 h-6 text-white" />
        </div>
        <span className="text-sm text-muted-foreground">Loading users…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="shrink-0 border-b border-border bg-background z-10">
        <div className="px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <UsersIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Users</h1>
                <p className="text-xs text-muted-foreground">Manage access, roles & enrollment data</p>
              </div>
            </div>
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, email, city..."
                className="pl-9 h-10 bg-muted/40 border-border/50 focus:bg-background transition-colors"
              />
              {query && (
                <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Quick Stats Bar */}
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/50">
            <div className="flex items-center gap-1.5">
              <UsersIcon className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total</span>
              <span className="text-xs font-bold">{rows.length}</span>
            </div>
            <div className="w-px h-3.5 bg-border" />
            <div className="flex items-center gap-1.5">
              <Crown className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-xs text-muted-foreground">Admins</span>
              <span className="text-xs font-bold">{quickStats.admins}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-muted/20">
        <div className="space-y-2.5 max-w-5xl mx-auto">

          {filtered.length === 0 && (
            <div className="text-center py-20">
              <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                <Search className="w-7 h-7 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-medium text-muted-foreground mb-1">No users found</p>
              <p className="text-xs text-muted-foreground/70">No results matching "{query}"</p>
            </div>
          )}

          {filtered.map((u) => {
            const isExp = expanded.has(u.user_id);
            const d = details[u.user_id];
            const isLoading = loadingDetails.has(u.user_id);

            return (
              <Card
                key={u.user_id}
                className={`bg-card border-border overflow-hidden transition-all duration-200 ${
                  isExp ? 'shadow-md ring-1 ring-primary/10' : 'shadow-sm hover:shadow-md'
                }`}
              >
                {/* User Row */}
                <div
                  className="p-3 sm:p-4 flex items-center gap-3 cursor-pointer select-none"
                  onClick={() => toggleExpand(u.user_id)}
                >
                  <div className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center transition-colors ${isExp ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}>
                    {isExp ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </div>

                  <div className={`relative shrink-0 w-10 h-10 rounded-full overflow-hidden ${u.isAdmin ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-card' : ''}`}>
                    {u.avatar_url ? (
                      <img src={u.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-sm font-bold text-primary/70">
                        {(u.display_name || u.email || '?')[0].toUpperCase()}
                      </div>
                    )}
                    {u.isAdmin && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-amber-400 flex items-center justify-center border-2 border-card">
                        <Crown className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm truncate">{u.display_name || 'Unnamed User'}</span>
                      {u.isAdmin && (
                        <Badge className="text-[9px] px-1.5 py-0 h-4 bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50 font-bold gap-0.5">
                          <Crown className="w-2.5 h-2.5" /> ADMIN
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground">
                      <Mail className="w-3 h-3 shrink-0" />
                      <span className="truncate">{u.email || '—'}</span>
                      {u.phone && (
                        <>
                          <span className="text-border">·</span>
                          <PhoneIcon className="w-3 h-3 shrink-0" />
                          <span className="truncate">{u.phone}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                    <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-[10px] font-semibold">
                      <Trophy className="w-3 h-3" /> Lvl {u.level}
                    </div>
                    <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-orange-50 text-orange-700 text-[10px] font-semibold">
                      <Flame className="w-3 h-3" /> {u.xp.toLocaleString()} XP
                    </div>
                  </div>

                  <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant={u.isAdmin ? 'outline' : 'default'}
                      className={`h-8 text-xs gap-1.5 ${
                        u.isAdmin
                          ? 'border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800'
                          : 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-sm'
                      }`}
                      onClick={() => openAdminDialog(u.user_id, u.isAdmin)}
                    >
                      {u.isAdmin ? (
                        <><ShieldOff className="w-3.5 h-3.5" /> Revoke</>
                      ) : (
                        <><Shield className="w-3.5 h-3.5" /> Make Admin</>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExp && (
                  isLoading ? (
                    <div className="border-t border-border px-6 py-8 flex items-center justify-center bg-muted/10">
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      <span className="ml-3 text-xs text-muted-foreground">Loading full details…</span>
                    </div>
                  ) : d ? (
                    <div className="border-t border-border bg-gradient-to-b from-muted/30 to-muted/10">

                      {/* Summary Stats Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-0 border-b border-border">
                        {[
                          { icon: <Calendar className="w-3.5 h-3.5" />, label: 'Joined', value: new Date(u.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }), color: 'text-slate-600' },
                          { icon: <Coins className="w-3.5 h-3.5" />, label: 'Total Spent', value: `₹${d.totalSpent.toLocaleString()}`, color: 'text-green-600' },
                          { icon: <BookOpen className="w-3.5 h-3.5" />, label: 'Courses', value: String(d.enrollments.length), color: 'text-blue-600' },
                          { icon: <Tag className="w-3.5 h-3.5" />, label: 'Promos Used', value: String(d.redemptions.length), color: 'text-orange-600' },
                          { icon: <ClipboardCheck className="w-3.5 h-3.5" />, label: 'Tests Taken', value: String(d.attempts.length), color: 'text-purple-600' },
                        ].map((stat, i) => (
                          <div key={i} className={`px-4 py-3 ${i > 0 ? 'border-l border-border' : ''} ${i >= 2 ? 'border-t sm:border-t-0' : ''}`}>
                            <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
                              {stat.icon}
                              <span className="text-[10px] uppercase tracking-wider font-medium">{stat.label}</span>
                            </div>
                            <div className={`font-bold text-sm ${stat.color}`}>{stat.value}</div>
                          </div>
                        ))}
                      </div>

                      <div className="p-4 sm:p-5 space-y-5">

                        {/* NEW: Personal & Address Details */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Personal Info */}
                          <div className="p-3 bg-background rounded-lg border space-y-3">
                            <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5" /> Personal Details
                            </h4>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                              <div>
                                <span className="text-muted-foreground block">Gender</span>
                                <span className="font-medium">{u.gender || '—'}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground block">DOB</span>
                                <span className="font-medium">{u.date_of_birth ? new Date(u.date_of_birth).toLocaleDateString() : '—'}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground block">Language</span>
                                <span className="font-medium">{u.language || '—'}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground block">Phone</span>
                                <span className="font-medium">{u.phone || '—'}</span>
                              </div>
                            </div>
                          </div>

                          {/* Address Info */}
                          <div className="p-3 bg-background rounded-lg border space-y-3">
                            <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5" /> Address
                            </h4>
                            <div className="text-xs space-y-1">
                              {u.address ? <p className="text-foreground">{u.address}</p> : <p className="text-muted-foreground italic">No address provided</p>}
                              <p className="text-muted-foreground">
                                {[u.city, u.state, u.country].filter(Boolean).join(', ') || '—'}
                                {u.pincode && <span className="ml-2 font-medium">({u.pincode})</span>}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Streak & Gamification */}
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-50 border border-orange-100">
                            <Flame className="w-4 h-4 text-orange-500" />
                            <div>
                              <div className="text-[10px] text-orange-600 uppercase tracking-wider font-semibold">Current Streak</div>
                              <div className="text-sm font-bold text-orange-700">{u.current_streak} days</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-100">
                            <Trophy className="w-4 h-4 text-red-500" />
                            <div>
                              <div className="text-[10px] text-red-600 uppercase tracking-wider font-semibold">Longest Streak</div>
                              <div className="text-sm font-bold text-red-700">{u.longest_streak} days</div>
                            </div>
                          </div>
                        </div>

                        {/* Enrolled Courses */}
                        <div>
                          <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2.5 tracking-wider flex items-center gap-1.5">
                            <GraduationCap className="w-3.5 h-3.5" /> Enrolled Courses
                          </h4>

                          {d.enrollments.length === 0 ? (
                            <div className="text-center py-6 border border-dashed rounded-lg bg-background">
                              <BookOpen className="w-6 h-6 mx-auto text-muted-foreground/30 mb-2" />
                              <p className="text-xs text-muted-foreground">No courses enrolled yet</p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {d.enrollments.map((e: any) => {
                                const isGranted = e.promocode === 'ADMIN_GRANT';
                                const isPromo = !isGranted && !!e.promocode;
                                const isFree = !isGranted && !isPromo && (e.amount_paid_inr || 0) === 0;
                                const isPaid = !isGranted && !isFree && !isPromo;

                                return (
                                  <div key={e.id} className="group relative p-3 bg-background rounded-lg border hover:border-primary/20 transition-colors">
                                    <div className="flex items-center gap-3">
                                      <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${e.pct === 100 ? 'bg-green-50' : 'bg-primary/5'}`}>
                                        {e.pct === 100 ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <BookOpen className="w-4 h-4 text-primary/60" />}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="font-medium text-xs truncate">{e.courses?.title || 'Unknown Course'}</div>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                          {isGranted && <Badge className="text-[9px] px-1.5 py-0 h-3.5 bg-primary/10 text-primary border-0 font-semibold">Granted</Badge>}
                                          {isPromo && <Badge className="text-[9px] px-1.5 py-0 h-3.5 bg-orange-50 text-orange-600 border-0 font-semibold">{e.promocode}</Badge>}
                                          {isPaid && <span className="text-[10px] font-semibold text-green-600">₹{(e.amount_paid_inr || 0).toLocaleString()}</span>}
                                          {isFree && <Badge className="text-[9px] px-1.5 py-0 h-3.5 bg-blue-50 text-blue-600 border-0 font-semibold">Free</Badge>}
                                          <span className="text-[10px] text-muted-foreground">
                                            {new Date(e.enrolled_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                          </span>
                                        </div>
                                      </div>
                                      <div className="shrink-0 flex items-center gap-2">
                                        <div className="text-right">
                                          <span className={`text-xs font-bold ${e.pct === 100 ? 'text-green-600' : 'text-primary'}`}>{e.pct}%</span>
                                          {e.totalParts > 0 && <span className="text-[9px] text-muted-foreground block leading-none">{e.doneParts}/{e.totalParts} parts</span>}
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 w-7 p-0 text-destructive/50 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                          onClick={() => revoke(u.user_id, e.id)}
                                          title="Revoke access"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                      </div>
                                    </div>
                                    <div className="w-full h-1.5 bg-muted rounded-full mt-2.5 overflow-hidden">
                                      <div
                                        className={`h-full rounded-full transition-all duration-500 ${e.pct === 100 ? 'bg-gradient-to-r from-green-400 to-emerald-500' : 'bg-gradient-to-r from-primary/80 to-primary'}`}
                                        style={{ width: `${e.pct}%` }}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Grant Course */}
                          <div className="mt-3 p-3 rounded-lg border border-dashed bg-background/50">
                            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                              <div className="flex-1 min-w-0">
                                <Select
                                  value={grantCourse[u.user_id] || undefined}
                                  onValueChange={(v) => setGrantCourse({ ...grantCourse, [u.user_id]: v })}
                                >
                                  <SelectTrigger className="h-9 text-xs bg-background border-border/50">
                                    <SelectValue placeholder="Select course to grant access…" />
                                  </SelectTrigger>
                                  <SelectContent className="bg-card">
                                    {allCourses
                                      .filter((c) => !d.enrollments.some((e: any) => e.courses?.id === c.id))
                                      .map((c) => (
                                        <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                                      ))}
                                    {allCourses.filter((c) => !d.enrollments.some((e: any) => e.courses?.id === c.id)).length === 0 && (
                                      <SelectItem value="_none" disabled>All courses already assigned</SelectItem>
                                    )}
                                  </SelectContent>
                                </Select>
                              </div>
                              <Button
                                size="sm"
                                onClick={() => grant(u.user_id)}
                                disabled={!grantCourse[u.user_id] || granting === u.user_id}
                                className="h-9 gap-1.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-sm"
                              >
                                {granting === u.user_id ? (
                                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Granting…</>
                                ) : (
                                  <><Plus className="w-3.5 h-3.5" /> Grant Access</>
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>

                        {/* Recent Tests */}
                        <div>
                          <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2.5 tracking-wider flex items-center gap-1.5">
                            <ClipboardCheck className="w-3.5 h-3.5" /> Recent Tests
                          </h4>
                          {d.attempts.length === 0 ? (
                            <div className="text-center py-6 border border-dashed rounded-lg bg-background">
                              <ClipboardCheck className="w-6 h-6 mx-auto text-muted-foreground/30 mb-2" />
                              <p className="text-xs text-muted-foreground">No tests taken yet</p>
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              {d.attempts.map((a: any) => {
                                const pct = a.total ? Math.round((a.score / a.total) * 100) : 0;
                                return (
                                  <div key={a.id} className={`flex items-center justify-between p-2.5 rounded-lg border transition-colors ${a.passed ? 'bg-green-50/50 border-green-100 hover:border-green-200' : 'bg-red-50/30 border-red-100 hover:border-red-200'}`}>
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${a.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {a.passed ? '✓' : '✗'}
                                      </div>
                                      <div className="min-w-0">
                                        <span className="text-xs font-medium truncate block">{a.tests?.title || 'Test'}</span>
                                        <span className="text-[10px] text-muted-foreground">
                                          {a.finished_at ? new Date(a.finished_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0 ml-2">
                                      <div className="text-right">
                                        <span className={`text-xs font-bold ${a.passed ? 'text-green-600' : 'text-red-600'}`}>{a.score}/{a.total}</span>
                                        <span className={`text-[10px] ml-1 font-semibold ${pct >= 80 ? 'text-green-500' : pct >= 50 ? 'text-amber-500' : 'text-red-500'}`}>({pct}%)</span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        
                        {/* Promo Redemptions */}
                        {d.redemptions.length > 0 && (
                          <div>
                            <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2.5 tracking-wider flex items-center gap-1.5">
                              <Tag className="w-3.5 h-3.5" /> Promo Redemptions
                            </h4>
                            <div className="space-y-1.5">
                              {d.redemptions.map((r: any) => (
                                <div key={r.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-orange-50/30 border-orange-100">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className="shrink-0 w-6 h-6 rounded-md bg-orange-100 flex items-center justify-center">
                                      <Tag className="w-3 h-3 text-orange-600" />
                                    </div>
                                    <div className="min-w-0">
                                      <span className="text-xs font-medium font-mono">{r.promocodes?.code || '—'}</span>
                                      {r.courses?.title && <span className="text-[10px] text-muted-foreground ml-1.5">→ {r.courses.title}</span>}
                                    </div>
                                  </div>
                                  <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                                    {new Date(r.redeemed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null
                )}
              </Card>
            );
          })}
          <div className="h-8" />
        </div>
      </div>

      {/* Admin Assign/Revoke Dialog */}
      <Dialog open={adminDialog.open} onOpenChange={(v) => setAdminDialog({ ...adminDialog, open: v })}>
        <DialogContent className="bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${adminDialog.currentIsAdmin ? 'bg-red-50 text-red-600' : 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white'}`}>
                {adminDialog.currentIsAdmin ? <UserX className="w-5 h-5" /> : <UserCheck className="w-5 h-5" />}
              </div>
              <div>
                <span>{adminDialog.currentIsAdmin ? 'Revoke Admin Access' : 'Assign Admin Role'}</span>
                <p className="text-xs font-normal text-muted-foreground mt-0.5">
                  {adminDialog.currentIsAdmin ? 'Remove administrator privileges' : 'Grant full administrator privileges'}
                </p>
              </div>
            </DialogTitle>
            <DialogDescription className="pt-2">
              This action requires the secure admin password to proceed. This is a sensitive operation.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Admin Password</Label>
            <div className="relative mt-1.5">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="password"
                value={adminPassInput}
                onChange={(e) => setAdminPassInput(e.target.value)}
                placeholder="Enter admin password"
                className="pl-9 h-11 bg-background"
                onKeyDown={(e) => e.key === 'Enter' && handleAdminAction()}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAdminDialog({ open: false, userId: null, currentIsAdmin: false })} className="flex-1 sm:flex-none">Cancel</Button>
            <Button
              variant={adminDialog.currentIsAdmin ? 'destructive' : 'default'}
              onClick={handleAdminAction}
              disabled={adminActionLoading || !adminPassInput}
              className={`flex-1 sm:flex-none ${!adminDialog.currentIsAdmin ? 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white' : ''}`}
            >
              {adminActionLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Processing…</>
              ) : adminDialog.currentIsAdmin ? (
                <><ShieldOff className="w-4 h-4 mr-2" /> Confirm Revoke</>
              ) : (
                <><Shield className="w-4 h-4 mr-2" /> Confirm Assign</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUsers;