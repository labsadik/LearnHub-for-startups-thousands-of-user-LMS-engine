import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { 
  Loader2, 
  ShieldCheck, 
  CheckCircle2, 
  ArrowLeft, 
  CreditCard, 
  Tag, 
  Heart,
  HandHeart,
  Info
} from 'lucide-react';
import { toast } from 'sonner';
import { formatPriceINR } from '@/lib/format';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// --- Configuration ---
const PLATFORM_FEE = 200; 
const TAX_RATE = 0.18; // 18% IGST
const DONATION_OPTIONS = [100, 200, 500];

const Checkout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // Promo Code States
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{ amount: number; code: string; id: string } | null>(null);
  const [applyingPromo, setApplyingPromo] = useState(false);

  // Donation States
  const [donationAmount, setDonationAmount] = useState<number>(0);
  const [customDonation, setCustomDonation] = useState<string>('');
  const [isCustom, setIsCustom] = useState(false);

  const courseId = location.state?.courseId;

  // --- Data Fetching ---
  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    if (!courseId) {
      navigate('/courses');
      return;
    }

    const loadData = async () => {
      setLoading(true);
      const { data: courseData, error } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .single();

      if (error || !courseData) {
        toast.error('Course not found');
        navigate('/courses');
        return;
      }
      setCourse(courseData);
      setLoading(false);
    };

    loadData();
  }, [user, courseId]);

  // --- Pricing Calculation ---
  const pricing = useMemo(() => {
    if (!course) return { 
      base: 0, discount: 0, platformFee: 0, donation: 0, taxableAmount: 0, tax: 0, total: 0 
    };

    const basePrice = course.price_inr || 0;
    const discountAmount = appliedPromo?.amount || 0;
    const fee = PLATFORM_FEE;
    const donation = isCustom ? parseInt(customDonation || '0') : donationAmount;

    const discountedPrice = Math.max(0, basePrice - discountAmount);
    const taxableAmount = discountedPrice + fee;
    const tax = Math.round(taxableAmount * TAX_RATE);
    const total = taxableAmount + tax + donation;

    return {
      base: basePrice,
      discount: discountAmount,
      platformFee: fee,
      donation: donation,
      taxableAmount: taxableAmount,
      tax: tax,
      total: total
    };
  }, [course, appliedPromo, donationAmount, customDonation, isCustom]);

  // --- Handlers ---

  const handleDonationSelect = (amount: number) => {
    setDonationAmount(amount);
    setIsCustom(false);
    setCustomDonation('');
  };

  const handleCustomDonationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (/^\d*$/.test(val)) {
      setCustomDonation(val);
      setIsCustom(true);
      setDonationAmount(0);
    }
  };

  // FIX: Validate AND Update DB automatically on Apply
  const handleApplyPromo = async () => {
    if (!promoInput.trim()) return;
    if (!user) return;
    
    setApplyingPromo(true);

    try {
      // 1. Check if code exists and is active
      const { data, error } = await supabase
        .from('promocodes')
        .select('*') // Select all fields to check validity
        .eq('code', promoInput.trim().toUpperCase())
        .eq('is_active', true)
        .maybeSingle();

      if (error || !data) {
        toast.error('Invalid promo code');
        setApplyingPromo(false);
        return;
      }

      // 2. Client-side Validation
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        toast.error('Promo code expired');
        setApplyingPromo(false);
        return;
      }

      if (data.max_uses && data.uses_count >= data.max_uses) {
        toast.error('Code exhausted');
        setApplyingPromo(false);
        return;
      }

      if (data.course_id && data.course_id !== course.id) {
        toast.error('Code not valid for this course');
        setApplyingPromo(false);
        return;
      }

      // 3. Check if user already redeemed this code
      const { data: existingRedemption } = await supabase
        .from('promocode_redemptions')
        .select('id')
        .eq('user_id', user.id)
        .eq('promocode_id', data.id)
        .maybeSingle();

      if (existingRedemption) {
        // If already redeemed, just apply it to UI (maybe they refreshed)
        const amount = data.discount_type === 'percent'
          ? Math.round((course.price_inr * data.discount_value) / 100)
          : data.discount_value;
        
        setAppliedPromo({ 
          amount: Math.min(amount, course.price_inr), 
          code: data.code, 
          id: data.id 
        });
        toast.success('Code applied!');
        setApplyingPromo(false);
        return;
      }

      // 4. Insert Redemption (This triggers the DB trigger to increment uses_count)
      const { error: redeemError } = await supabase.from('promocode_redemptions').insert({
        user_id: user.id,
        course_id: course.id,
        promocode_id: data.id,
      });

      if (redeemError) {
        console.error('Redemption insert failed:', redeemError);
        // Handle race condition error (code might have been exhausted between check and insert)
        if (redeemError.message.includes('unique constraint') || redeemError.message.includes('exhausted')) {
             toast.error('Code exhausted or already used.');
        } else {
             toast.error('Could not apply code. Please try again.');
        }
        setApplyingPromo(false);
        return;
      }

      // 5. Calculate Discount & Apply to UI
      const amount = data.discount_type === 'percent'
        ? Math.round((course.price_inr * data.discount_value) / 100)
        : data.discount_value;

      setAppliedPromo({ 
        amount: Math.min(amount, course.price_inr), 
        code: data.code, 
        id: data.id 
      });
      
      toast.success(`Code applied! You save ${formatPriceINR(Math.min(amount, course.price_inr))}`);

    } catch (err) {
      console.error(err);
      toast.error('Failed to apply promo code');
    } finally {
      setApplyingPromo(false);
    }
  };

  const handlePayment = async () => {
    if (!user || !course) return;
    
    setProcessing(true);
    try {
      const payload = {
        course_id: course.id,
        promocode_id: appliedPromo?.id || undefined,
        donation_amount: pricing.donation, 
        success_url: `${window.location.origin}/courses/${course.slug}?paid=1`,
        cancel_url: `${window.location.origin}/checkout?canceled=1`
      };

      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: payload,
      });

      if (error) {
        toast.error('Could not initiate payment.');
        console.error(error);
        setProcessing(false);
        return;
      }

      const result = data as any;
      if (result?.url) {
        window.location.href = result.url;
      } else {
        toast.error('Unexpected response from server.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Payment failed.');
    } finally {
      setProcessing(false);
    }
  };

  if (loading || !course) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-screen bg-slate-50 py-8 md:py-12">
      <div className="max-w-5xl mx-auto px-4">
        
        {/* Header */}
        <div className="mb-8">
          <Button variant="ghost" size="sm" className="mb-4 text-slate-500 hover:text-slate-800" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Course
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-xl border border-primary/20">
              <CreditCard className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">Secure Checkout</h1>
              <p className="text-sm text-slate-500">Complete your enrollment for <span className="font-semibold text-slate-700">{course.title}</span></p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
          
          {/* Left Column: Details */}
          <div className="lg:col-span-3 space-y-6">
            
            {/* Course Card */}
            <Card className="p-6 border-slate-200 shadow-sm bg-white">
              <div className="flex gap-4">
                {course.thumbnail_url && (
                  <img src={course.thumbnail_url} alt={course.title} className="w-24 h-16 object-cover rounded-md border hidden sm:block" />
                )}
                <div className="flex-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Course</span>
                  <h3 className="font-bold text-slate-900 leading-tight">{course.title}</h3>
                  <p className="text-xs text-slate-500 mt-1">By {course.instructor || 'LearnHub'}</p>
                </div>
              </div>

              <Separator className="my-4" />

              {/* Promo Code */}
              <div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      value={promoInput}
                      onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                      placeholder="Enter Promo Code"
                      className="pl-9 h-11 bg-white"
                      disabled={!!appliedPromo}
                    />
                  </div>
                  {appliedPromo ? (
                    <Button variant="destructive" className="h-11 shrink-0" onClick={() => { setAppliedPromo(null); setPromoInput(''); toast.info('Promo removed'); }}>
                      Remove
                    </Button>
                  ) : (
                    <Button 
                      variant="outline" 
                      className="h-11 shrink-0 border-primary text-primary hover:bg-primary/5" 
                      onClick={handleApplyPromo} 
                      disabled={applyingPromo || !promoInput}
                    >
                      {applyingPromo ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply'}
                    </Button>
                  )}
                </div>
                {appliedPromo && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-green-700 bg-green-50 p-2 rounded border border-green-100">
                    <CheckCircle2 className="w-4 h-4" />
                    <span><strong>{appliedPromo.code}</strong> applied! You save <strong>{formatPriceINR(appliedPromo.amount)}</strong></span>
                  </div>
                )}
              </div>
            </Card>

            {/* Donation Section */}
            <Card className="p-6 border-rose-200 bg-gradient-to-br from-rose-50 to-white shadow-sm">
              <div className="flex items-start gap-3 mb-4">
                <div className="p-2 bg-rose-100 rounded-full">
                  <HandHeart className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Support a Cause</h3>
                  <p className="text-xs text-slate-600 mt-1">
                    100% of your donation goes to underprivileged children.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                {DONATION_OPTIONS.map((amt) => (
                  <Button 
                    key={amt}
                    type="button"
                    variant={!isCustom && donationAmount === amt ? "default" : "outline"}
                    className={!isCustom && donationAmount === amt ? "bg-rose-600 hover:bg-rose-700" : "border-rose-300 text-rose-700"}
                    onClick={() => handleDonationSelect(amt)}
                  >
                    ₹{amt}
                  </Button>
                ))}
              </div>

              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">₹</span>
                <Input 
                  placeholder="Custom Amount"
                  className="pl-7 bg-white border-rose-200"
                  value={customDonation}
                  onChange={handleCustomDonationChange}
                />
              </div>
            </Card>

            {/* Terms Dialog */}
            <div className="flex items-center gap-2 text-xs text-slate-500 justify-end">
              <Info className="w-3.5 h-3.5" />
              <span>
                By proceeding, you agree to our{' '}
                <Dialog>
                  <DialogTrigger asChild>
                    <button className="text-primary underline font-medium hover:text-primary/80">Terms & Conditions</button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Terms & Conditions</DialogTitle>
                    </DialogHeader>
                    <div className="text-sm text-slate-600 space-y-4 max-h-[60vh] overflow-y-auto py-2">
                      <p><strong>1. Pricing Structure:</strong><br/>
                      The course price is exclusive of taxes. A fixed Platform Fee of ₹{PLATFORM_FEE} is added to every order.
                      </p>
                      <p><strong>2. Taxation (IGST):</strong><br/>
                      IGST @ 18% is applicable on the Course Price and Platform Fee.
                      </p>
                      <p><strong>3. Refund Policy:</strong><br/>
                      All sales are final. <span className="text-red-600 font-semibold">No refunds</span>.
                      </p>
                    </div>
                  </DialogContent>
                </Dialog>
              </span>
            </div>
          </div>

          {/* Right Column: Order Summary */}
          <div className="lg:col-span-2">
            <Card className="p-6 shadow-lg border-slate-200 bg-white sticky top-24">
              <h3 className="text-lg font-bold text-slate-800 mb-4">Order Summary</h3>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Course Price</span>
                  <span>{formatPriceINR(pricing.base)}</span>
                </div>
                
                {pricing.discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span>- {formatPriceINR(pricing.discount)}</span>
                  </div>
                )}

                <div className="flex justify-between text-slate-600">
                  <span>Platform Fee</span>
                  <span>{formatPriceINR(pricing.platformFee)}</span>
                </div>

                {pricing.donation > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span className="flex items-center gap-1"><Heart className="w-3 h-3 fill-rose-500" /> Donation</span>
                    <span>{formatPriceINR(pricing.donation)}</span>
                  </div>
                )}

                <Separator />

                <div className="flex justify-between text-slate-700 font-medium">
                  <span>Subtotal (Taxable)</span>
                  <span>{formatPriceINR(pricing.taxableAmount + pricing.donation)}</span>
                </div>

                <div className="flex justify-between text-slate-400 text-xs">
                  <span>IGST (18%)</span>
                  <span>{formatPriceINR(pricing.tax)}</span>
                </div>
                
                <Separator />

                <div className="flex items-end justify-between pt-2">
                  <span className="text-sm font-semibold text-slate-500 uppercase">Total Payable</span>
                  <div className="text-right">
                    <span className="text-2xl font-extrabold text-slate-900">{formatPriceINR(pricing.total)}</span>
                    <p className="text-[10px] text-slate-400 mt-1">Incl. of all taxes</p>
                  </div>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 p-3 rounded-md border">
                  <ShieldCheck className="w-4 h-4 text-green-600 shrink-0" />
                  <span>100% Secure Payment powered by Stripe.</span>
                </div>

                <Button
                  className="w-full h-12 text-base font-bold shadow-md hover:shadow-lg transition-all bg-slate-900 hover:bg-slate-800"
                  onClick={handlePayment}
                  disabled={processing}
                >
                  {processing ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <CreditCard className="w-5 h-5 mr-2" /> Pay {formatPriceINR(pricing.total)}
                    </>
                  )}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;