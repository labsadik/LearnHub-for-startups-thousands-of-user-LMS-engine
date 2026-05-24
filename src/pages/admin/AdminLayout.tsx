import { Link, Outlet, useLocation } from 'react-router-dom';
import { BookOpen, Tag, Users, Shield, LayoutDashboard, ListChecks, Megaphone, Monitor, Wallet } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

const AdminLayout = () => {
  const loc = useLocation();
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="fixed inset-0 flex items-center justify-center p-8 bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="max-w-sm space-y-6 text-center">
          <div className="mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-xl shadow-indigo-500/20">
            <Monitor className="w-10 h-10 text-white" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">Desktop Required</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The admin dashboard is optimized for larger screens. Please switch to a desktop or tablet for the best experience.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const items = [
    { to: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
    { to: '/admin/courses', label: 'Courses', icon: BookOpen },
    { to: '/admin/tests', label: 'Tests', icon: ListChecks },
    { to: '/admin/announcements', label: 'Announcements', icon: Megaphone },
    { to: '/admin/promocodes', label: 'Promocodes', icon: Tag },
    { to: '/admin/revenue', label: 'Revenue', icon: Wallet },
    { to: '/admin/users', label: 'Users', icon: Users },
  ];

  return (
    /* 
      SCROLL FIX EXPLAINED:
      "fixed inset-0" glues the entire layout to the screen like a desktop app.
      "overflow-hidden" kills the default browser body scroll completely.
    */
    <div className="fixed inset-0 flex overflow-hidden bg-muted/30">
      
      {/* 
        SIDEBAR: Locked in place. 
        Will NEVER move or scroll when you scroll the main content.
      */}
      <aside className="w-[250px] h-full bg-card border-r border-border/80 flex flex-col flex-shrink-0 z-10">
        
        {/* Logo / Brand */}
        <div className="h-16 flex items-center gap-3 px-5 border-b border-border/80 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/20">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight leading-none">LearnHub</span>
            <span className="text-[10px] text-muted-foreground font-medium leading-none mt-1.5 uppercase tracking-wider">Admin Panel</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1 mt-2">
          {items.map(({ to, label, icon: Icon, exact }) => {
            const active = exact ? loc.pathname === to : loc.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${
                  active 
                    ? 'bg-primary/10 text-primary shadow-sm shadow-primary/5' 
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 transition-colors duration-200 ${
                  active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                }`} /> 
                <span className="flex-1">{label}</span>
                {active && (
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-border/80 shrink-0">
          <div className="flex items-center gap-2 px-1">
            <div className="w-2 h-2 rounded-full bg-green-500 shadow-sm shadow-green-500/30" />
            <span className="text-[11px] text-muted-foreground font-medium">Secure Connection</span>
          </div>
        </div>
      </aside>

      {/* 
        RIGHT SIDE MAIN CONTENT: 
        "flex-1" takes up all remaining width.
        "h-full" ensures it perfectly matches the screen height.
        The nested div with "overflow-y-auto" is the ONLY thing that scrolls.
      */}
      <main className="flex-1 h-full flex flex-col overflow-hidden bg-muted/20">
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 lg:p-8 w-full max-w-[1600px] mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
      
    </div>
  );
};

export default AdminLayout;