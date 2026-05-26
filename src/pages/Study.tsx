import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSEO } from '@/lib/seo';
import { Loader2, Play, Video, Radio, StickyNote, Clock, CalendarDays, BookOpen, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import AnnouncementBell from '@/components/AnnouncementBell';
import GamifyChip from '@/components/GamifyChip';
import { useCachedData } from '@/hooks/useCachedData'; // ✨ Import Cache Hook

// ─── INTERFACES ───
interface CourseBasic {
  id: string;
  title: string;
  slug: string;
}

interface PartItem {
  id: string;
  name: string;
  kind: 'recorded' | 'live';
  created_at: string;
  notes_url: string | null;
  course_slug: string;
  course_id: string;
  duration: string | null;
  live_chat_enabled: boolean;
}

// ─── CACHE HELPER ───
// Prevents "not iterable" crashes if Redis returns a Supabase wrapper object
function normalizeArray<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object' && 'data' in raw) {
    const inner = (raw as Record<string, unknown>).data;
    if (Array.isArray(inner)) return inner;
  }
  return [];
}

/* ════════════════════════════════════════════════════════
   MAIN STUDY PAGE
   ════════════════════════════════════════════════════════ */
const Study = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // UI States
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isMobileCalendarOpen, setIsMobileCalendarOpen] = useState(false);

  useSEO({ title: 'My Learning — LearnHub', description: 'Manage your schedule and courses.' });

  // ─── 1. CACHED: Fetch Enrolled Courses ───
  const { data: rawEnrolled, loading: isLoadingEnrolled } = useCachedData<CourseBasic[]>(
    user ? `user:${user.id}:enrollments` : '__no_user__',
    async () => {
      if (!user) return [];
      const { data: ens } = await supabase
        .from('enrollments')
        .select('id, courses(id, slug, title)')
        .eq('user_id', user.id);
      
      return (ens || []).map((e: any) => e.courses).filter(Boolean);
    },
    [user?.id], // Dependencies
    []          // Initial Data (prevents null)
  );

  const enrolled = useMemo(() => normalizeArray<CourseBasic>(rawEnrolled), [rawEnrolled]);

  // Auto-select the first course when enrollment data loads
  useEffect(() => {
    if (!selectedCourseId && enrolled.length > 0) {
      setSelectedCourseId(enrolled[0].id);
    }
  }, [enrolled, selectedCourseId]);

  // ─── 2. CACHED: Fetch Parts (Lectures) ───
  const { data: rawParts, loading: isLoadingParts } = useCachedData<PartItem[]>(
    selectedCourseId ? `course:${selectedCourseId}:parts` : '__no_course__',
    async () => {
      if (!selectedCourseId) return [];
      
      const { data: parts, error } = await supabase
        .from('parts')
        .select(`id, name, kind, created_at, notes_url, duration, live_chat_enabled, chapter:chapters!inner ( subject:subjects!inner ( course_id, course:courses (slug) ) )`)
        .eq('chapter.subject.course_id', selectedCourseId);
        
      if (error) throw error;
      
      // Map data - extract slug directly from the Supabase join instead of local state
      return (parts || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        kind: p.kind,
        created_at: p.created_at,
        notes_url: p.notes_url,
        duration: p.duration,
        live_chat_enabled: p.live_chat_enabled || false,
        course_slug: p.chapter?.subject?.course?.slug || '',
        course_id: selectedCourseId
      }));
    },
    [selectedCourseId], // Dependencies
    []                  // Initial Data (prevents null)
  );

  const allParts = useMemo(() => normalizeArray<PartItem>(rawParts), [rawParts]);

  // Combine loading states for the main skeleton
  const loading = isLoadingEnrolled;

  // ─── MEMOIZED FILTERS ───
  const selectedDayEvents = useMemo(() => {
    const iso = selectedDate.toDateString();
    return allParts.filter(e => new Date(e.created_at).toDateString() === iso);
  }, [selectedDate, allParts]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, PartItem[]>();
    allParts.forEach(p => {
      const dateStr = new Date(p.created_at).toDateString();
      if (!map.has(dateStr)) map.set(dateStr, []);
      map.get(dateStr)!.push(p);
    });
    return map;
  }, [allParts]);

  const handleEventClick = (event: PartItem) => {
    navigate(`/learn/${event.course_slug}?lectureId=${event.id}`);
  };
  
  const handleDateChange = (value: Date) => {
    setSelectedDate(value);
    setIsMobileCalendarOpen(false);
  };

  // ─── RENDER ───
  if (loading) return <div className="flex-1 flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="flex-1 px-4 py-8 max-w-7xl mx-auto w-full space-y-6">
      
      {/* ─── HEADER ─── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border/40 pb-6">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">My Learning</h1>
          <p className="text-sm text-muted-foreground">Select a course to view your schedule.</p>
        </div>
        
        {/* Right Side Group: Selector + Stats + Bell */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 w-full md:w-auto justify-end">
          {enrolled.length > 0 && (
            <div className="w-full sm:w-auto flex flex-col">
              <label className="text-xs font-medium text-muted-foreground mb-1 hidden md:block">Current Course</label>
              <Select value={selectedCourseId || ""} onValueChange={setSelectedCourseId}>
                <SelectTrigger className="w-full sm:w-[280px] bg-background border-border/80 shadow-sm focus:ring-primary/30">
                  <BookOpen className="w-4 h-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Select Course" />
                </SelectTrigger>
                <SelectContent 
                  className="w-[--radix-select-trigger-width] rounded-xl border-border/60 bg-card shadow-xl p-2" 
                  position="popper" 
                  sideOffset={5}
                >
                  {enrolled.map((c) => (
                    <SelectItem 
                      key={c.id} 
                      value={c.id}
                      className="rounded-lg focus:bg-primary/10 focus:text-primary cursor-pointer py-2.5 px-3 transition-colors"
                    >
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          
          {/* Stats Row */}
          <div className="flex items-center gap-2 justify-end py-2 sm:py-0">
             <GamifyChip />
             <AnnouncementBell />
          </div>
        </div>
      </div>

      {enrolled.length === 0 && !loading && (
         <Card className="p-12 text-center bg-muted/10 border-dashed border-2 flex flex-col items-center justify-center min-h-[400px] rounded-xl">
           <BookOpen className="w-12 h-12 text-muted-foreground/30 mb-4" />
           <h3 className="font-semibold text-lg text-foreground mb-1">No Courses Enrolled</h3>
           <p className="text-sm text-muted-foreground max-w-[300px]">It looks like you haven't enrolled in any courses yet.</p>
         </Card>
      )}

      {selectedCourseId && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
          
          {/* ─── MOBILE TOGGLE HEADER ─── */}
          <div className="lg:hidden col-span-1">
            <button 
              onClick={() => setIsMobileCalendarOpen(!isMobileCalendarOpen)}
              className="w-full flex items-center justify-between p-4 bg-card rounded-lg shadow-sm border border-border/40 mb-4"
            >
              <div className="flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-primary" />
                <span className="font-semibold text-foreground">
                  {selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                </span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                 {selectedDayEvents.length > 0 && (
                   <span className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full font-bold">
                     {selectedDayEvents.length} Lectures
                   </span>
                 )}
                 <ChevronDown className={cn("w-5 h-5 transition-transform", isMobileCalendarOpen && "rotate-180")} />
              </div>
            </button>
          </div>

          {/* ─── CALENDAR SECTION ─── */}
          <div className={cn(
            "xl:col-span-2 space-y-4 transition-all duration-300 ease-in-out",
            isMobileCalendarOpen ? "block" : "hidden lg:block"
          )}>
            <div className="hidden lg:flex items-center gap-2">
               <CalendarDays className="w-5 h-5 text-primary" />
               <h2 className="font-semibold text-lg text-foreground">Schedule</h2>
            </div>
            
            <Card className="border-border/40 bg-card shadow-sm rounded-xl overflow-hidden p-0">
              <style>{`
                .react-calendar { width: 100%; border: none; font-family: inherit; background: transparent; line-height: 1.5; padding: 16px; }
                .react-calendar__navigation { margin-bottom: 16px; display: flex; align-items: center; }
                .react-calendar__navigation button { font-size: 18px; font-weight: 600; color: hsl(var(--foreground)); min-width: 40px; border-radius: 8px; }
                .react-calendar__navigation button:disabled { background-color: transparent; color: hsl(var(--muted-foreground)); }
                .react-calendar__navigation button:enabled:hover, .react-calendar__navigation button:enabled:focus { background-color: hsl(var(--accent)); }
                .react-calendar__navigation__label { flex-grow: 1 !important; font-weight: 700; }
                .react-calendar__month-view__weekdays { color: hsl(var(--muted-foreground)); text-align: center; text-transform: uppercase; font-size: 11px; font-weight: 600; letter-spacing: 0.05em; margin-bottom: 8px; }
                .react-calendar__month-view__weekdays abbr { text-decoration: none; }
                .react-calendar__month-view__weekdays__weekday { padding: 8px 5px; }
                .react-calendar__month-view__days { row-gap: 4px; }
                
                .react-calendar__tile {
                  padding: 0; background: transparent; border-radius: 8px; position: relative; height: 60px;
                  display: flex; flex-direction: column; align-items: center; justify-content: center;
                  color: hsl(var(--foreground)); font-size: 14px; font-weight: 500;
                  border: 2px solid transparent; transition: all 0.15s ease;
                }
                .react-calendar__month-view__days__day--neighboringMonth { color: hsl(var(--muted-foreground) / 0.4); }
                .react-calendar__tile:enabled:hover { background-color: hsl(var(--accent)); }
                
                .react-calendar__tile--now { background: transparent; border: 2px solid hsl(var(--primary)); font-weight: 700; color: hsl(var(--primary)); }
                .react-calendar__tile--now:enabled:hover { background: hsl(var(--primary) / 0.05); }
                
                .react-calendar__tile--active { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); font-weight: 700; border-color: transparent; }
                .react-calendar__tile--active:enabled:hover { background: hsl(var(--primary)); }
                
                .event-count-badge { position: absolute; bottom: 6px; left: 0; right: 0; display: flex; justify-content: center; pointer-events: none; }
                .event-count-badge span { font-size: 10px; font-weight: 700; color: hsl(var(--primary)); background: hsl(var(--primary) / 0.1); padding: 0 4px; border-radius: 4px; }
                .react-calendar__tile--active .event-count-badge span { color: hsl(var(--primary-foreground)); background: hsl(var(--primary-foreground) / 0.2); }
                
                @media (max-width: 640px) {
                  .react-calendar__tile { height: 50px; font-size: 13px; }
                  .react-calendar { padding: 8px; }
                  .event-count-badge span { font-size: 9px; }
                }
              `}</style>
              
              <Calendar
                onChange={(value) => handleDateChange(value as Date)}
                value={selectedDate}
                nextLabel={<ChevronRight className="w-5 h-5" />}
                prevLabel={<ChevronLeft className="w-5 h-5" />}
                next2Label={null}
                prev2Label={null}
                tileContent={({ date, view }) => {
                  if (view === 'month') {
                    const dateStr = date.toDateString();
                    const dayEvents = eventsByDate.get(dateStr) || [];
                    if (dayEvents.length > 0) {
                      return (
                        <div className="event-count-badge">
                          <span>({dayEvents.length})</span>
                        </div>
                      );
                    }
                  }
                  return null;
                }}
              />
            </Card>
          </div>

          {/* ─── LECTURE LIST COLUMN ─── */}
          <div className={cn(
            "space-y-4 xl:sticky xl:top-20 transition-all",
            isMobileCalendarOpen ? "hidden lg:block" : "block"
          )}>
            
            <div className="hidden lg:flex items-center justify-between px-1">
              <h3 className="font-semibold text-sm flex items-center gap-2 text-foreground">
                <Clock className="w-4 h-4 text-muted-foreground" />
                {selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
              </h3>
              <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => { setSelectedDate(new Date()); setIsMobileCalendarOpen(false); }}>
                Today
              </Button>
            </div>

            <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-2 custom-scrollbar">
              {isLoadingParts ? (
                 <div className="space-y-3">{[1,2,3].map(i => (<div key={i} className="h-20 bg-muted/40 rounded-lg animate-pulse" />))}</div>
              ) : (
                <>
                  {selectedDayEvents.length === 0 ? (
                    <Card className="p-6 text-center text-muted-foreground border-dashed border-2 rounded-lg bg-muted/5">
                      <Video className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm font-medium">No lectures</p>
                      <p className="text-xs">scheduled for this day</p>
                    </Card>
                  ) : (
                    selectedDayEvents.map(ev => (
                      <Card 
                        key={ev.id} 
                        className="group relative overflow-hidden p-4 flex items-center justify-between hover:bg-accent/30 cursor-pointer border-border/40 transition-all duration-200 rounded-lg shadow-sm"
                        onClick={() => handleEventClick(ev)}
                      >
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                            ev.kind === 'live' ? "bg-orange-100 dark:bg-orange-900/20" : "bg-blue-100 dark:bg-blue-900/20"
                          )}>
                            {ev.kind === 'live' ? <Radio className="w-4 h-4 text-orange-600" /> : <Video className="w-4 h-4 text-blue-600" />}
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-foreground line-clamp-1 group-hover:text-primary transition-colors">{ev.name}</p>
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                              {ev.kind === 'live' && (<span className="font-bold text-orange-500 uppercase tracking-wide text-[10px]">Live</span>)}
                              {ev.duration && <span>{ev.duration}</span>}
                              <span className="opacity-60">•</span>
                              <span>{new Date(ev.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {ev.notes_url && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-background/80" onClick={(e) => { e.stopPropagation(); window.open(ev.notes_url!, '_blank'); }}>
                              <StickyNote className="w-4 h-4 text-muted-foreground hover:text-primary" />
                            </Button>
                          )}
                          <Play className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                      </Card>
                    ))
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Study;