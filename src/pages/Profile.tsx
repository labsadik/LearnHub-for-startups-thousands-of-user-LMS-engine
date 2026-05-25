import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';

import {
  Loader2,
  Upload,
  Camera,
  Shield,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

import { toast } from 'sonner';
import { useSEO } from '@/lib/seo';

// Comprehensive list of countries
const COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan",
  "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi",
  "Cabo Verde", "Cambodia", "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czech Republic",
  "Denmark", "Djibouti", "Dominica", "Dominican Republic",
  "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia",
  "Fiji", "Finland", "France",
  "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana",
  "Haiti", "Honduras", "Hungary",
  "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Ivory Coast",
  "Jamaica", "Japan", "Jordan",
  "Kazakhstan", "Kenya", "Kiribati", "Kosovo", "Kuwait", "Kyrgyzstan",
  "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg",
  "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar",
  "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea", "North Macedonia", "Norway",
  "Oman",
  "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal",
  "Qatar",
  "Romania", "Russia", "Rwanda",
  "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria",
  "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu",
  "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan",
  "Vanuatu", "Vatican City", "Venezuela", "Vietnam",
  "Yemen",
  "Zambia", "Zimbabwe"
];

const LANGUAGES = [
  "English", "Hindi", "Spanish", "French", "Arabic", "Bengali", "Portuguese", "Russian", "Japanese", "German", "Chinese", "Korean", "Turkish", "Italian", "Dutch", "Indonesian", "Polish", "Swedish", "Tagalog", "Vietnamese", "Other"
];

const GENDERS = ["Male", "Female", "Other"];

const Profile = () => {
  const { user } = useAuth();

  const [profile, setProfile] = useState<any>(null);

  // Personal Info
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [avatar, setAvatar] = useState('');
  const [gender, setGender] = useState('');
  const [dob, setDob] = useState('');
  const [language, setLanguage] = useState('');
  
  // Address Info
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('');
  const [pincode, setPincode] = useState('');

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  useSEO({ title: 'My Profile — LearnHub' });

  // Calculate Age
  const calculateAge = (dobString: string) => {
    if (!dobString) return null;
    const today = new Date();
    const birthDate = new Date(dobString);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
  };

  const age = calculateAge(dob);

  // Profile Completion
  const fieldsToCheck = [name, phone, avatar, gender, dob, language, address, city, state, country, pincode];
  const filledFields = fieldsToCheck.filter(Boolean).length;
  const profileCompletion = Math.round((filledFields / fieldsToCheck.length) * 100);

  useEffect(() => {
    if (!user) return;
    (async () => {
      let { data, error } = await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
      if (error) { toast.error(error.message); return; }
      
      if (!data) {
        const { data: created } = await supabase.from('profiles').insert({ user_id: user.id, display_name: user.email?.split('@')[0] }).select('*').single();
        data = created;
      }
      
      setProfile(data);
      setName(data?.display_name || '');
      setPhone(data?.phone || '');
      setAvatar(data?.avatar_url || '');
      setGender(data?.gender || '');
      setDob(data?.date_of_birth || '');
      setLanguage(data?.language || '');
      setAddress(data?.address || '');
      setCity(data?.city || '');
      setState(data?.state || '');
      setCountry(data?.country || '');
      setPincode(data?.pincode || '');
    })();
  }, [user]);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) { toast.error('Invalid file type'); return; }
    if (file.size > 3 * 1024 * 1024) { toast.error('Max size 3MB'); return; }

    setUploading(true);
    try {
      const path = `${user.id}/avatar-${Date.now()}.${file.name.split('.').pop()}`;
      const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      setAvatar(data.publicUrl);
      await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('user_id', user.id);
      toast.success('Photo updated');
    } catch (err) {
      toast.error('Upload failed');
    }
    setUploading(false);
  };

  const save = async () => {
    if (!user) return;
    
    // Validation for required fields
    if (!name || !phone || !gender || !dob || !language || !address || !city || !state || !country || !pincode) {
      toast.error("Please fill in all required fields marked with *");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      display_name: name,
      phone,
      gender,
      date_of_birth: dob || null,
      language,
      address,
      city,
      state,
      country,
      pincode
    }).eq('user_id', user.id);

    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success('Profile saved successfully');
  };

  if (!profile) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="flex-1 px-4 py-6 sm:py-10 max-w-6xl w-full mx-auto bg-muted/30 min-h-screen">
      
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">My Profile</h1>
        <p className="text-muted-foreground mt-1 text-sm">Manage your personal information and address.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Avatar & Status */}
        <div className="space-y-6">
          <Card className="p-6 flex flex-col items-center text-center gap-4 shadow-sm bg-card">
            <div className="relative group">
              <Avatar className="w-28 h-28 border-4 border-background shadow-lg">
                <AvatarImage src={avatar} alt={name} className="object-cover" />
                <AvatarFallback className="text-3xl bg-muted">{(name || 'U')[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <button onClick={() => fileRef.current?.click()} className="absolute bottom-1 right-1 bg-primary text-white rounded-full p-2 shadow-lg hover:scale-110 transition-transform border-2 border-background">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickFile} />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Upload className="w-4 h-4 mr-2" /> Change
            </Button>

            <Separator />

            <div className="w-full text-left space-y-2">
              <div className="flex justify-between text-sm font-medium">
                <span>Completion</span>
                <span className="text-primary">{profileCompletion}%</span>
              </div>
              <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${profileCompletion}%` }} />
              </div>
            </div>

            <Separator />
            
            <div className="w-full space-y-2 text-sm text-left">
               <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span className="truncate ml-2">{user?.email}</span></div>
               {age && <div className="flex justify-between"><span className="text-muted-foreground">Age</span><span>{age} yrs</span></div>}
            </div>
          </Card>

          {/* Warning Card */}
          <Card className="p-4 border-red-500/20 bg-red-500/5">
             <div className="flex gap-3 text-sm">
                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                <p className="text-red-500/90">
                   <strong>Notice:</strong> Providing fake details may result in account suspension. Ensure data is accurate.
                </p>
             </div>
          </Card>
        </div>

        {/* Right Column: Forms */}
        <Card className="lg:col-span-2 p-6 sm:p-8 shadow-sm bg-card">
          <div className="space-y-8">
            
            {/* Personal Info */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Personal Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Display Name <span className="text-red-500">*</span></Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full Name" />
                </div>
                <div className="space-y-2">
                  <Label>Phone <span className="text-red-500">*</span></Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765..." />
                </div>
                <div className="space-y-2">
                  <Label>Gender <span className="text-red-500">*</span></Label>
                  <Select value={gender} onValueChange={setGender}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{GENDERS.map(g => <SelectItem key={g} value={g.toLowerCase()}>{g}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Date of Birth <span className="text-red-500">*</span></Label>
                  <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Language <span className="text-red-500">*</span></Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger><SelectValue placeholder="Select Language" /></SelectTrigger>
                    <SelectContent>{LANGUAGES.map(l => <SelectItem key={l} value={l.toLowerCase()}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            {/* Address Info */}
            <div className="space-y-4">
               <h2 className="text-xl font-semibold">Address Details</h2>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                 <div className="space-y-2 md:col-span-2">
                   <Label>Street Address <span className="text-red-500">*</span></Label>
                   <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="House No, Street Name" />
                 </div>

                 <div className="space-y-2">
                   <Label>City <span className="text-red-500">*</span></Label>
                   <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Mumbai" />
                 </div>

                 <div className="space-y-2">
                   <Label>State / Province <span className="text-red-500">*</span></Label>
                   <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="Maharashtra" />
                 </div>

                 <div className="space-y-2">
                   <Label>Country <span className="text-red-500">*</span></Label>
                   <Select value={country} onValueChange={setCountry}>
                     <SelectTrigger><SelectValue placeholder="Select Country" /></SelectTrigger>
                     <SelectContent className="max-h-60">
                       {COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                     </SelectContent>
                   </Select>
                 </div>

                 <div className="space-y-2">
                   <Label>Pincode / ZIP <span className="text-red-500">*</span></Label>
                   <Input value={pincode} onChange={(e) => setPincode(e.target.value)} placeholder="400001" />
                 </div>
               </div>
            </div>

            {/* Submit */}
            <div className="flex justify-end pt-4 border-t">
              <Button onClick={save} disabled={saving} size="lg" className="px-10">
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Save Profile
              </Button>
            </div>

          </div>
        </Card>
      </div>
    </div>
  );
};

export default Profile;