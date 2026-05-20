import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { 
  Trash2, 
  Plus, 
  Megaphone, 
  Search, 
  AlertTriangle, 
  Pencil, 
  FolderOpen, 
  FolderClosed, 
  ChevronDown,
  ChevronUp,
  X,
  Send
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

const emptyForm = { course_id: '', title: '', body: '', image_url: '' };

const AdminAnnouncements = () => {
  const [courses, setCourses] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  
  // Form State
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  
  // Folder State
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  
  // Delete Dialog State
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; id: string | null; title: string }>({ open: false, id: null, title: '' });
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    const [{ data: c }, { data: a }] = await Promise.all([
      supabase.from('courses').select('id, title').order('title'),
      supabase.from('announcements').select('*, courses(title)').order('created_at', { ascending: false }).limit(500),
    ]);
    setCourses(c || []);
    setItems(a || []);
  };

  useEffect(() => { load(); }, []);

  // Group items by course ID
  const filteredItems = useMemo(() => {
    return items.filter(a => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${a.title} ${a.body || ''} ${a.courses?.title || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, search]);

  const filteredGroups = useMemo(() => {
    const groups: { [key: string]: any[] } = {};
    filteredItems.forEach(item => {
      const id = item.course_id || 'uncategorized';
      if (!groups[id]) groups[id] = [];
      groups[id].push(item);
    });
    return groups;
  }, [filteredItems]);

  const toggleFolder = (id: string) => {
    const newOpen = new Set(openFolders);
    if (newOpen.has(id)) newOpen.delete(id);
    else newOpen.add(id);
    setOpenFolders(newOpen);
  };

  // --- Editor Logic ---
  const openCreateModal = () => {
    setForm(emptyForm);
    setEditingId(null);
    setIsEditorOpen(true);
  };

  const openEditModal = (item: any) => {
    setForm({
      course_id: item.course_id,
      title: item.title,
      body: item.body || '',
      image_url: item.image_url || '',
    });
    setEditingId(item.id);
    setIsEditorOpen(true);
  };

  const closeEditorModal = () => {
    setIsEditorOpen(false);
    setForm(emptyForm);
    setEditingId(null);
  };

  const save = async () => {
    if (!form.course_id) { toast.error('Please select a course', { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> }); return; }
    if (!form.title.trim()) { toast.error('Title is required', { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> }); return; }
    
    setSaving(true);
    try {
      if (editingId) {
        // Update
        const { error } = await supabase.from('announcements').update({
          course_id: form.course_id,
          title: form.title.trim(),
          body: form.body?.trim() || null,
          image_url: form.image_url?.trim() || null,
        }).eq('id', editingId);
        
        if (error) throw error;
        toast.success('Announcement updated successfully');
      } else {
        // Create
        const { error } = await supabase.from('announcements').insert({
          course_id: form.course_id,
          title: form.title.trim(),
          body: form.body?.trim() || null,
          image_url: form.image_url?.trim() || null,
        });
        if (error) throw error;
        toast.success('Announcement posted successfully');
      }
      
      closeEditorModal();
      load();
    } catch (err: any) {
      toast.error(err.message, { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> });
    } finally {
      setSaving(false);
    }
  };

  // --- Delete Logic ---
  const openDeleteDialog = (id: string, title: string) => {
    setDeleteDialog({ open: true, id, title });
  };

  const confirmDelete = async () => {
    if (!deleteDialog.id) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('announcements').delete().eq('id', deleteDialog.id);
      if (error) throw error;
      toast.success('Announcement deleted');
      setDeleteDialog({ open: false, id: null, title: '' });
      load();
    } catch (err: any) {
      toast.error(err.message, { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden pb-20 relative">
      
      {/* Header */}
      <div className="shrink-0 mb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-4 px-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-primary" /> Announcements
          </h1>
          <p className="text-xs text-muted-foreground mt-1">Manage course updates.</p>
        </div>
        
        {/* Search Bar */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder="Search..." 
            className="pl-9 h-9 bg-background text-xs w-full"
          />
        </div>
      </div>

      {/* History / Folders Section */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-4">
        <div className="flex items-center justify-between mb-1 px-1">
          <h3 className="text-sm font-bold text-muted-foreground">Course History</h3>
          <span className="text-xs text-muted-foreground">{filteredItems.length} Total</span>
        </div>

        {filteredItems.length === 0 && (
          <div className="text-center py-12 border border-dashed rounded-lg text-muted-foreground text-sm">
            No announcements found.
          </div>
        )}

        {/* Render Folders */}
        {courses.map((course) => {
          const courseItems = filteredGroups[course.id] || [];
          if (courseItems.length === 0) return null;
          const isOpen = openFolders.has(course.id);

          return (
            <Card key={course.id} className="bg-card border-border shadow-sm overflow-hidden">
              {/* Folder Header */}
              <button 
                onClick={() => toggleFolder(course.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  {isOpen ? <FolderOpen className="w-5 h-5 text-primary" /> : <FolderClosed className="w-5 h-5 text-muted-foreground" />}
                  <div className="flex flex-col">
                    <span className="font-semibold text-sm">{course.title}</span>
                    <span className="text-[10px] text-muted-foreground">{courseItems.length} item{courseItems.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {courseItems.length}
                  </span>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </button>

              {/* Folder Content */}
              {isOpen && (
                <div className="border-t border-border bg-muted/20 p-3 space-y-3 animate-in slide-in-from-top-2 duration-200">
                  {courseItems.map((a) => (
                    <div key={a.id} className="group bg-card border border-border rounded-lg p-3 hover:shadow-md transition-shadow flex gap-3 relative">
                      {/* Thumbnail */}
                      <div className="w-16 h-16 shrink-0 rounded bg-muted border border-border overflow-hidden">
                        {a.image_url ? (
                          <img src={a.image_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                            <Megaphone className="w-5 h-5" />
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                          <h4 className="font-semibold text-sm truncate pr-2">{a.title}</h4>
                        </div>
                        <p className="text-[11px] text-muted-foreground mb-1">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</p>
                        {a.body && (
                          <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">
                            {a.body}
                          </p>
                        )}
                      </div>
                      
                      {/* Hover Actions */}
                      <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-card/80 backdrop-blur rounded p-1 border shadow-sm">
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => openEditModal(a)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => openDeleteDialog(a.id, a.title)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* --- FLOATING ACTION BUTTON (POP STYLE) --- */}
      <Button 
        onClick={openCreateModal}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-2xl hover:scale-110 transition-transform z-40 flex items-center justify-center bg-primary text-primary-foreground"
        size="icon"
      >
        <Plus className="w-6 h-6" />
      </Button>

      {/* --- CREATE / EDIT DIALOG --- */}
      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="bg-card sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingId ? (
                <><Pencil className="w-5 h-5 text-primary" /> Edit Announcement</>
              ) : (
                <><Send className="w-5 h-5 text-primary" /> Send New Announcement</>
              )}
            </DialogTitle>
            <DialogDescription>
              {editingId ? "Update the details below." : "Fill in the details to broadcast to students."}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Course <span className="text-destructive">*</span></Label>
              <Select value={form.course_id} onValueChange={(v) => setForm({ ...form, course_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
                <SelectContent>
                  {courses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Title <span className="text-destructive">*</span></Label>
              <Input 
                value={form.title} 
                onChange={(e) => setForm({ ...form, title: e.target.value })} 
                placeholder="e.g., Exam Schedule Update"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Body</Label>
              <Textarea 
                value={form.body} 
                onChange={(e) => setForm({ ...form, body: e.target.value })} 
                rows={4} 
                className="resize-none"
                placeholder="Message details..."
              />
            </div>

            <div className="space-y-2">
              <Label>Image URL</Label>
              <Input 
                value={form.image_url} 
                onChange={(e) => setForm({ ...form, image_url: e.target.value })} 
                placeholder="https://..."
              />
            </div>

            {form.image_url && (
              <div className="w-full h-32 bg-muted rounded-lg overflow-hidden border">
                <img src={form.image_url} alt="Preview" className="w-full h-full object-contain" />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeEditorModal} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving...' : editingId ? 'Update' : 'Send Announcement'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- DELETE CONFIRMATION DIALOG --- */}
      <Dialog open={deleteDialog.open} onOpenChange={(v) => setDeleteDialog({ ...deleteDialog, open: v })}>
        <DialogContent className="bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Delete Announcement
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <span className="font-bold text-foreground">"{deleteDialog.title}"</span>? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog({ open: false, id: null, title: '' })}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete Permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default AdminAnnouncements;