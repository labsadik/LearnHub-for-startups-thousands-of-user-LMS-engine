import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { BookOpen, User, LogOut, Shield, Trophy, ShoppingBag, Menu, X, LayoutDashboard } from 'lucide-react';
import GlobalLeaderboardDialog from './GlobalLeaderboardDialog';
import { motion, AnimatePresence } from 'framer-motion';
import ThemeToggle from './ThemeToggle';
import { cn } from '@/lib/utils';

interface ProfileData {
  display_name: string | null;
  avatar_url: string | null;
}

const HeaderContent = ({ pathname }: { pathname: string }) => {
  const { user, isAdmin, signOut } = useAuth();
  const nav = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [lbOpen, setLbOpen] = useState(false);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }

    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!error && data) {
        setProfile(data);
      }
    };

    fetchProfile();

    const channel = supabase
      .channel(`header-profile-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.new) {
            setProfile({
              display_name: payload.new.display_name,
              avatar_url: payload.new.avatar_url,
            });
            setAvatarError(false);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    setAvatarError(false);
  }, [profile?.avatar_url]);

  const getAvatarUrl = (): string | null => {
    if (!profile?.avatar_url) return null;
    if (profile.avatar_url.startsWith('http')) return profile.avatar_url;
    const { data } = supabase.storage.from('avatars').getPublicUrl(profile.avatar_url);
    return data?.publicUrl || null;
  };

  const getDisplayName = (): string => {
    if (profile?.display_name) return profile.display_name;
    if (user?.user_metadata?.full_name) return user.user_metadata.full_name;
    if (user?.user_metadata?.display_name) return user.user_metadata.display_name;
    if (user?.email) return user.email.split('@')[0];
    return 'User';
  };

  const avatarUrl = getAvatarUrl();
  const displayName = getDisplayName();

  const navLinks = [
    { to: '/courses', label: 'Courses' },
    ...(user ? [{ to: '/dashboard', label: 'Dashboard' }] : []),
    ...(user ? [{ to: '/study', label: 'Study' }] : []),
    ...(user ? [{ to: '/rewards', label: 'Rewards' }] : []),
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-7xl flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        
        {/* Logo Section */}
        <Link to="/auth" className="flex items-center gap-2 font-bold text-lg shrink-0 group">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center overflow-hidden transition-transform group-hover:scale-105">
            <BookOpen className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font tracking-tight">LearnHub</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((l) => {
            const isActive = pathname === l.to || pathname.startsWith(l.to + '/');
            return (
              <Link
                key={l.to}
                to={l.to}
                className={cn(
                  "relative px-4 py-2 text-sm font-medium transition-colors rounded-md hover:bg-muted",
                  isActive ? "text-foreground bg-muted/50" : "text-muted-foreground"
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        {/* Right Side Actions */}
        <div className="flex items-center gap-3 shrink-0">
          <ThemeToggle />

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-2 h-9 px-2 rounded-full hover:bg-muted transition-colors overflow-hidden focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                  aria-label="User menu"
                >
                  <div className="h-8 w-8 rounded-full bg-muted border flex items-center justify-center overflow-hidden">
                    {avatarUrl && !avatarError ? (
                      <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" onError={() => setAvatarError(true)} />
                    ) : (
                      <span className="text-xs font-semibold text-muted-foreground uppercase">{displayName.slice(0, 2)}</span>
                    )}
                  </div>
                  <span className="hidden md:block text-sm font-medium text-foreground truncate max-w-[100px]">
                    {displayName}
                  </span>
                </button>
              </DropdownMenuTrigger>

              {/* Updated Dropdown Content for 'Drop-in' style */}
              <DropdownMenuContent 
                align="end" 
                sideOffset={8} 
                className="w-64 overflow-hidden rounded-xl border border-border bg-card p-2 shadow-2xl"
              >
                {/* Profile Header inside Dropdown */}
                <div className="flex items-center gap-3 px-2 py-3 mb-1 border-b border-border/50">
                  <div className="h-11 w-11 rounded-full bg-muted border flex items-center justify-center overflow-hidden">
                    {avatarUrl && !avatarError ? (
                      <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" onError={() => setAvatarError(true)} />
                    ) : (
                      <span className="text-base font-bold text-muted-foreground uppercase">{displayName.slice(0, 2)}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate leading-tight">{displayName}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{user.email}</p>
                  </div>
                </div>
                
                <div className="py-1">
                  <DropdownMenuItem onClick={() => nav('/dashboard')} className="rounded-lg gap-3 px-2.5 py-2.5 cursor-pointer">
                    <LayoutDashboard className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm">Dashboard</span>
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem onClick={() => nav('/study')} className="rounded-lg gap-3 px-2.5 py-2.5 cursor-pointer">
                    <BookOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm">My Learning</span>
                  </DropdownMenuItem>

                  <DropdownMenuItem onClick={() => setLbOpen(true)} className="rounded-lg gap-3 px-2.5 py-2.5 cursor-pointer">
                    <Trophy className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm">Leaderboard</span>
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem onClick={() => nav('/profile')} className="rounded-lg gap-3 px-2.5 py-2.5 cursor-pointer">
                    <User className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm">Profile</span>
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem onClick={() => nav('/rewards')} className="rounded-lg gap-3 px-2.5 py-2.5 cursor-pointer">
                    <ShoppingBag className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm">Rewards Shop</span>
                  </DropdownMenuItem>
                </div>
                
                {isAdmin && (
                  <>
                    <DropdownMenuSeparator className="my-1" />
                    <DropdownMenuItem onClick={() => nav('/admin')} className="rounded-lg gap-3 px-2.5 py-2.5 cursor-pointer bg-primary/5 text-primary focus:bg-primary/10 focus:text-primary font-medium">
                      <Shield className="w-4 h-4 shrink-0" />
                      <span className="text-sm">Admin Panel</span>
                    </DropdownMenuItem>
                  </>
                )}
                
                <DropdownMenuSeparator className="my-1" />
                
                <DropdownMenuItem onClick={signOut} className="rounded-lg gap-3 px-2.5 py-2.5 cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive">
                  <LogOut className="w-4 h-4 shrink-0" />
                  <span className="text-sm">Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild size="sm" className="hidden md:inline-flex h-9 px-5 rounded-lg shadow-sm">
              <Link to="/auth">Sign in</Link>
            </Button>
          )}

          {!user && (
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden h-9 w-9 rounded-lg hover:bg-muted flex items-center justify-center transition-colors overflow-hidden"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Mobile Menu for Non-Logged In Users */}
      <AnimatePresence>
        {!user && mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/60 md:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 280 }}
              className="fixed top-0 right-0 z-50 h-full w-[80%] max-w-xs bg-card border-l border-border overflow-hidden md:hidden flex flex-col shadow-xl"
            >
              <div className="flex items-center justify-between p-4 border-b border-border">
                <span className="font-bold text-lg">Menu</span>
                <button onClick={() => setMobileOpen(false)} className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center overflow-hidden">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <nav className="flex-1 p-3 space-y-1 overflow-y-auto overflow-x-hidden">
                {navLinks.map((l, i) => {
                  const isActive = pathname === l.to || pathname.startsWith(l.to + '/');
                  
                  return (
                    <motion.div
                      key={l.to}
                      initial={{ opacity: 0, x: 16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.05 + i * 0.04 }}
                    >
                      <Link
                        to={l.to}
                        className={cn(
                          "block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                          isActive 
                            ? "bg-primary/10 text-primary font-semibold" 
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        )}
                      >
                        {l.label}
                      </Link>
                    </motion.div>
                  );
                })}
                <div className="pt-4 mt-2 border-t">
                  <Link
                    to="/auth"
                    className="block px-3 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground text-center shadow-sm"
                  >
                    Sign in
                  </Link>
                </div>
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {user && <GlobalLeaderboardDialog open={lbOpen} onOpenChange={setLbOpen} />}
    </header>
  );
};

const Header = () => {
  const loc = useLocation();
  if (
    loc.pathname.startsWith('/learn/') ||
    loc.pathname.startsWith('/admin') ||
    loc.pathname.startsWith('/test/') ||
    loc.pathname === '/auth' ||
    loc.pathname.startsWith('/auth/')
  ) return null;
  return <HeaderContent pathname={loc.pathname} />;
};

export default Header;