import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { BookOpen, LayoutDashboard, Trophy, School, Loader2, GraduationCap, Compass } from 'lucide-react';
import { cn } from '@/lib/utils';
import GlobalLeaderboardDialog from './GlobalLeaderboardDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface CourseBasic {
  id: string;
  title: string;
  slug: string;
  thumbnail_url?: string | null;
}

export default function TabMobileNavbar() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  // State for Dialogs
  const [lbOpen, setLbOpen] = useState(false);
  const [batchesOpen, setBatchesOpen] = useState(false);
  const [batches, setBatches] = useState<CourseBasic[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);

  // Avatar State
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState(false);
  const [initials, setInitials] = useState('U');

  // Fetch Avatar
  useEffect(() => {
    if (!user) {
      setAvatarUrl(null);
      setInitials('U');
      return;
    }

    const fetchAvatar = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        if (data.avatar_url) {
          const url = data.avatar_url.startsWith('http')
            ? data.avatar_url
            : supabase.storage.from('avatars').getPublicUrl(data.avatar_url).data?.publicUrl;
          setAvatarUrl(url || null);
        } else {
          setAvatarUrl(null);
        }
        const name =
          data.display_name ||
          user.user_metadata?.full_name ||
          user.user_metadata?.display_name ||
          user.email?.split('@')[0] ||
          'User';
        setInitials(name.slice(0, 2).toUpperCase());
      }
    };

    fetchAvatar();

    const ch = supabase
      .channel(`bnav-avatar-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.new) {
            const d = payload.new as any;
            if (d.avatar_url) {
              const url = d.avatar_url.startsWith('http')
                ? d.avatar_url
                : supabase.storage.from('avatars').getPublicUrl(d.avatar_url).data?.publicUrl;
              setAvatarUrl(url || null);
            } else {
              setAvatarUrl(null);
            }
            setAvatarError(false);
            const name =
              d.display_name ||
              user.user_metadata?.full_name ||
              user.user_metadata?.display_name ||
              user.email?.split('@')[0] ||
              'User';
            setInitials(name.slice(0, 2).toUpperCase());
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [user]);

  // Fetch Batches for Popup
  useEffect(() => {
    if (batchesOpen && user) {
      setLoadingBatches(true);
      supabase
        .from('enrollments')
        .select('id, courses(id, title, slug, thumbnail_url)')
        .eq('user_id', user.id)
        .then(({ data, error }) => {
          if (!error && data) {
            setBatches(data.map((e: any) => e.courses).filter(Boolean));
          }
          setLoadingBatches(false);
        });
    }
  }, [batchesOpen, user]);

  /* ── Conditional returns AFTER all hooks ── */
  if (!user) return null;

  const path = location.pathname;
  
  // Updated Whitelist: Now includes /rewards and /courses routes
  const isWhitelisted =
    path === '/study' ||
    path.startsWith('/study/') ||
    path === '/dashboard' ||
    path.startsWith('/dashboard/') ||
    path === '/profile' ||
    path.startsWith('/profile/') ||
    path.startsWith('/learn/') ||
    path === '/rewards' ||          // Added Rewards
    path.startsWith('/rewards/') ||
    path === '/courses' ||          // Added Courses List
    path.startsWith('/courses/');   // Added Course Details

  if (!isWhitelisted) return null;

  const handleBatchClick = (slug: string) => {
    setBatchesOpen(false);
    navigate(`/learn/${slug}`);
  };

  const items = [
    {
      key: 'study',
      label: 'Study',
      to: '/study',
      active: path === '/study' || path.startsWith('/study/'),
      icon: BookOpen,
    },
    {
      key: 'courses',
      label: 'Courses',
      to: '/courses',
      active: path === '/courses' || (path.startsWith('/courses/') && !path.startsWith('/learn/')),
      icon: GraduationCap,
    },
    {
      key: 'batches',
      label: 'Batches',
      to: '#',
      active: false,
      icon: School,
      onClick: () => setBatchesOpen(true),
    },
    {
      key: 'dashboard',
      label: 'Dashboard',
      to: '/dashboard',
      active: path === '/dashboard' || path.startsWith('/dashboard/'),
      icon: LayoutDashboard,
    },
    {
      key: 'leaderboard',
      label: 'Ranks',
      to: '#',
      active: false,
      icon: Trophy,
      onClick: () => setLbOpen(true),
    },
  ];

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-40 lg:hidden border-t border-border/60 bg-card/80 backdrop-blur-xl">
        <div
          className="flex items-end justify-around px-1 pt-1.5 pb-2"
          style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick || (() => navigate(item.to))}
              className={cn(
                'relative flex flex-col items-center gap-[3px] min-w-[50px] max-w-[70px] py-1 rounded-xl transition-all duration-200',
                item.active
                  ? 'text-primary'
                  : 'text-muted-foreground/60 active:text-muted-foreground',
              )}
            >
              {item.active && (
                <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
              )}
              <item.icon
                className="w-[20px] h-[20px] transition-all duration-200"
                strokeWidth={item.active ? 2.2 : 1.5}
              />
              <span
                className={cn(
                  'text-[10px] leading-none transition-all duration-200',
                  item.active ? 'font-semibold' : 'font-medium',
                )}
              >
                {item.label}
              </span>
            </button>
          ))}

          {/* Profile Button */}
          <button
            type="button"
            onClick={() => navigate('/profile')}
            className={cn(
              'relative flex flex-col items-center gap-[3px] min-w-[50px] max-w-[70px] py-1 rounded-xl transition-all duration-200',
              path === '/profile' || path.startsWith('/profile/')
                ? 'text-primary'
                : 'text-muted-foreground/60 active:text-muted-foreground',
            )}
          >
            {path === '/profile' || path.startsWith('/profile/') ? (
              <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
            ) : null}
            <div
              className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center overflow-hidden transition-all duration-200',
                path === '/profile' || path.startsWith('/profile/')
                  ? 'ring-2 ring-primary/30 ring-offset-1 ring-offset-card'
                  : 'bg-muted',
              )}
            >
              {avatarUrl && !avatarError ? (
                <img
                  src={avatarUrl}
                  alt="Profile"
                  className="h-full w-full object-cover"
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <span className="text-[9px] font-bold leading-none">{initials}</span>
              )}
            </div>
            <span
              className={cn(
                'text-[10px] leading-none transition-all duration-200',
                path === '/profile' || path.startsWith('/profile/')
                  ? 'font-semibold'
                  : 'font-medium',
              )}
            >
              Profile
            </span>
          </button>
        </div>
      </nav>

      {/* Batches Selection Popup */}
      <Dialog open={batchesOpen} onOpenChange={setBatchesOpen}>
        <DialogContent className="bg-card max-w-sm rounded-xl p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b border-border/40 bg-muted/20">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <School className="w-5 h-5 text-primary" />
              My Batches
            </DialogTitle>
          </DialogHeader>
          <div className="p-2 max-h-[50vh] overflow-y-auto">
            {loadingBatches ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : batches.length === 0 ? (
              <div className="text-center py-8 px-4">
                <School className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-muted-foreground text-sm">You are not enrolled in any batches yet.</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => { setBatchesOpen(false); navigate('/courses'); }}>
                  Explore Courses
                </Button>
              </div>
            ) : (
              <div className="space-y-1">
                {batches.map((batch) => (
                  <button
                    key={batch.id}
                    onClick={() => handleBatchClick(batch.slug)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors text-left"
                  >
                    <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0">
                      {batch.thumbnail_url ? (
                        <img src={batch.thumbnail_url} alt={batch.title} className="w-full h-full object-cover" />
                      ) : (
                        <BookOpen className="w-6 h-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{batch.title}</p>
                      <p className="text-xs text-muted-foreground">Tap to open</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {/* Footer inside popup to explore more courses */}
          <div className="p-3 border-t border-border/40 bg-muted/10">
            <Button 
              variant="secondary" 
              className="w-full gap-2" 
              onClick={() => { setBatchesOpen(false); navigate('/courses'); }}
            >
              <Compass className="w-4 h-4" />
              Explore All Courses
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <GlobalLeaderboardDialog open={lbOpen} onOpenChange={setLbOpen} />
    </>
  );
}