import { useEffect, useState } from 'react';
import { Bell, Inbox, CheckCircle2, Calendar, BookOpen, MoreHorizontal } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

const AnnouncementBell = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [reads, setReads] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const [enrolledIds, setEnrolledIds] = useState<Set<string>>(new Set());

  const load = async () => {
    if (!user) return;
    
    setLoading(true);
    
    // 1. Load Enrollments
    const { data: ens, error: enErr } = await supabase
      .from('enrollments')
      .select('course_id')
      .eq('user_id', user.id);
      
    if (enErr) {
      console.error('enrollments load failed', enErr);
      setLoading(false);
      return;
    }

    const ids = new Set((ens || []).map((e: any) => e.course_id));
    setEnrolledIds(ids);

    if (ids.size === 0) {
      setItems([]);
      setReads(new Set());
      setLoading(false);
      return;
    }

    // 2. Load Announcements
    const { data: a, error: aErr } = await supabase
      .from('announcements')
      .select('*, courses(title, slug)')
      .in('course_id', Array.from(ids))
      .order('created_at', { ascending: false })
      .limit(50);

    if (aErr) {
      console.error('announcements load failed', aErr);
    } else {
      setItems(a || []);
    }

    // 3. Load Reads
    const { data: r } = await supabase
      .from('announcement_reads')
      .select('announcement_id')
      .eq('user_id', user.id);
      
    setReads(new Set((r || []).map((x: any) => x.announcement_id)));
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [user]);

  useEffect(() => {
    if (!user || enrolledIds.size === 0) return;

    // FIX: Use a unique channel name to avoid conflicts with cached channels on re-render
    const channelId = `announcements-bell-${user.id}-${crypto.randomUUID()}`;

    const ch = supabase
      .channel(channelId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, async (payload) => {
        const newRow: any = payload.new;
        if (!enrolledIds.has(newRow.course_id)) return;
        const { data: course } = await supabase.from('courses').select('title, slug').eq('id', newRow.course_id).maybeSingle();
        const data: any = { ...newRow, courses: course };
        setItems(prev => [data, ...prev.filter(p => p.id !== data.id)]);
        toast.info(`📢 ${data.title}`, { description: course?.title });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'announcements' }, (payload) => {
        setItems(prev => prev.filter(p => p.id !== (payload.old as any).id));
      })
      .subscribe();

    return () => { 
      supabase.removeChannel(ch); 
    };
  }, [user, enrolledIds]);

  const unread = items.filter(i => !reads.has(i.id)).length;

  const markAllRead = async () => {
    if (!user || unread === 0) return;
    const newOnes = items.filter(i => !reads.has(i.id)).map(i => ({ user_id: user.id, announcement_id: i.id }));
    // Optimistic UI update
    const newReadIds = new Set([...reads, ...newOnes.map(n => n.announcement_id)]);
    setReads(newReadIds);
    
    await supabase.from('announcement_reads').insert(newOnes);
  };

  if (!user) return null;

  return (
    <>
      {/* Bell Trigger */}
      <Button 
        variant="ghost" 
        size="icon" 
        className="relative h-9 w-9 rounded-full hover:bg-accent transition-colors"
        onClick={() => { setOpen(true); markAllRead(); }}
      >
        <Bell className="h-5 w-5 text-foreground" />
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 items-center justify-center bg-primary text-[10px] font-bold text-primary-foreground ring-2 ring-background">
              {unread > 9 ? '9+' : unread}
            </span>
          </span>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card max-w-lg max-h-[85vh] p-0 gap-0 flex flex-col overflow-hidden rounded-2xl shadow-2xl border-border/50">
          {/* Header */}
          <DialogHeader className="p-6 border-b bg-muted/30 shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl font-bold tracking-tight flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary" />
                Announcements
              </DialogTitle>
              {unread > 0 && (
                <span className="text-xs font-medium bg-primary/10 text-primary px-2.5 py-1 rounded-full flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  {unread} New
                </span>
              )}
            </div>
          </DialogHeader>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {loading ? (
              // Skeleton Loader
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-4 rounded-xl border border-border/50 bg-card/50 animate-pulse">
                    <div className="flex gap-4">
                      <div className="h-12 w-12 rounded-full bg-muted flex-shrink-0" />
                      <div className="space-y-2 flex-1">
                        <div className="h-4 w-3/4 bg-muted rounded" />
                        <div className="h-3 w-1/2 bg-muted rounded" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : items.length === 0 ? (
              // Empty State
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Inbox className="w-8 h-8 text-muted-foreground/50" />
                </div>
                <h3 className="font-semibold text-foreground">All caught up!</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                  You have no new announcements from your enrolled courses.
                </p>
              </div>
            ) : (
              // List
              <div className="space-y-3">
                {items.map((a) => {
                  const isRead = reads.has(a.id);
                  return (
                    <div 
                      key={a.id} 
                      className={`
                        relative overflow-hidden rounded-xl border p-0 transition-all duration-200 hover:shadow-md
                        ${isRead ? 'bg-card/50 border-border' : 'bg-card border-primary/20 shadow-sm'}
                      `}
                    >
                      {/* Unread Indicator Line */}
                      {!isRead && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />}

                      <div className="p-4 sm:p-5">
                        {/* Meta Row */}
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">
                            <BookOpen className="w-3 h-3" />
                            <span className="truncate max-w-[150px]">{a.courses?.title || 'General'}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80 whitespace-nowrap">
                            <Calendar className="w-3 h-3" />
                            {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                          </div>
                        </div>

                        {/* Content */}
                        <h4 className={`font-bold text-sm sm:text-base mb-2 leading-tight ${!isRead ? 'text-foreground' : 'text-foreground/80'}`}>
                          {a.title}
                        </h4>

                        {a.body && (
                          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap line-clamp-3">
                            {a.body}
                          </p>
                        )}

                        {/* Image */}
                        {a.image_url && (
                          <div className="mt-3 rounded-lg overflow-hidden border border-border/50 bg-muted/20">
                            <img 
                              src={a.image_url} 
                              alt={a.title} 
                              className="w-full h-auto max-h-48 object-cover hover:scale-105 transition-transform duration-500" 
                              loading="lazy" 
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          
          {/* Footer / Optional Actions */}
          <div className="p-3 border-t bg-muted/20 text-center shrink-0">
             <p className="text-[10px] text-muted-foreground">
               Marking items as read when opened
             </p>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Custom Scrollbar Styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: hsl(var(--border));
          border-radius: 20px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: hsl(var(--muted-foreground) / 0.5);
        }
      `}</style>
    </>
  );
};

export default AnnouncementBell;