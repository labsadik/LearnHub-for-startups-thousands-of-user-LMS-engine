import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- Configuration ---
const PLATFORM_FEE = 200;
const TAX_RATE = 0.18; // 18% IGST

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Authentication Check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, headers: corsHeaders 
      });
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!, 
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: authError } = await userClient.auth.getUser();
    if (authError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, headers: corsHeaders 
      });
    }
    
    const userId = userData.user.id;
    const userEmail = userData.user.email || undefined;
    
    // 2. Parse Request Body
    const body = await req.json();
    const course_id = body.course_id || body.courseId;
    const promocode_id = body.promocode_id || body.promocodeId;
    const donation_amount = parseInt(body.donation_amount || '0'); 

    if (!course_id) {
      return new Response(JSON.stringify({ error: 'course_id required' }), { 
        status: 400, headers: corsHeaders 
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!, 
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 3. Check for Existing Enrollment
    const { data: existing } = await admin
      .from('enrollments')
      .select('id')
      .eq('user_id', userId)
      .eq('course_id', course_id)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ already_enrolled: true }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // 4. Fetch Course Data
    const { data: course } = await admin
      .from('courses')
      .select('id, title, slug, price_inr, is_published')
      .eq('id', course_id)
      .maybeSingle();

    if (!course || !course.is_published) {
      return new Response(JSON.stringify({ error: 'Course not available' }), { 
        status: 404, headers: corsHeaders 
      });
    }

    // 5. Validate Promo Code (Fixed Logic)
    let discount = 0;
    let finalPromoId: string | null = null;
    let finalPromoCode: string | null = null;

    if (promocode_id) {
      const { data: pc } = await admin
        .from('promocodes')
        .select('*')
        .eq('id', promocode_id)
        .eq('is_active', true)
        .maybeSingle();
      
      if (pc) {
        const expired = pc.expires_at && new Date(pc.expires_at) < new Date();
        const wrongCourse = pc.course_id && pc.course_id !== course.id;

        // FIX: Check if THIS user has already redeemed it
        // Frontend inserts redemption on "Apply", so it should exist if they are paying.
        const { data: existingRedemption } = await admin
          .from('promocode_redemptions')
          .select('id')
          .eq('user_id', userId)
          .eq('promocode_id', pc.id)
          .maybeSingle();

        // Determine if exhausted
        // It is exhausted IF max_uses is set AND uses_count >= max_uses
        // AND the current user is NOT the one who has a redemption record.
        // (If the user has a record, they "claimed" the spot, so it's not exhausted for them).
        const isExhausted = pc.max_uses && pc.uses_count >= pc.max_uses && !existingRedemption;

        // Allow if: Not expired, Not wrong course, Not exhausted (or user has a claim)
        if (!expired && !wrongCourse && !isExhausted) {
          discount = pc.discount_type === 'percent' 
            ? Math.round((course.price_inr * pc.discount_value) / 100) 
            : pc.discount_value;
          discount = Math.min(discount, course.price_inr);
          
          finalPromoId = pc.id;
          finalPromoCode = pc.code;
        } else if (expired) {
           // Optional: Return specific error if needed, or just ignore promo
           console.log('Promo code expired');
        } else if (isExhausted) {
           console.log('Promo code exhausted');
        }
      }
    }

    // 6. CALCULATE FINAL PRICE SERVER-SIDE
    const basePrice = course.price_inr;
    const discountedCoursePrice = Math.max(0, basePrice - discount);
    
    // Fees
    const platformFee = PLATFORM_FEE;
    const taxableAmount = discountedCoursePrice + platformFee;
    const taxAmount = Math.round(taxableAmount * TAX_RATE);
    
    // Total
    const totalAmount = taxableAmount + taxAmount + donation_amount;

    // 7. Handle Free Enrollments
    if (totalAmount === 0) {
      const { error: insErr } = await admin.from('enrollments').insert({
        user_id: userId,
        course_id: course.id,
        amount_paid_inr: 0,
        promocode: finalPromoCode,
        promocode_id: finalPromoId,
        enrolled_at: new Date().toISOString(),
      });

      if (insErr) {
        console.error('Free enrollment failed:', insErr);
        return new Response(JSON.stringify({ error: 'Enrollment failed' }), { 
          status: 500, headers: corsHeaders 
        });
      }
      return new Response(JSON.stringify({ free: true }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // 8. Create Stripe Checkout Session
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      return new Response(JSON.stringify({ error: 'Stripe not configured' }), { 
        status: 500, headers: corsHeaders 
      });
    }
    
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
    const origin = req.headers.get('origin') || 'https://example.com';
    
    const successUrl = body.success_url || `${origin}/courses/${course.slug}?paid=1`;
    const finalSuccessUrl = successUrl.includes('{CHECKOUT_SESSION_ID}') 
      ? successUrl 
      : `${successUrl}&session_id={CHECKOUT_SESSION_ID}`;

    // Build Line Items
    const lineItems = [];

    // Item 1: Course (after discount)
    if (discountedCoursePrice > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: 'inr',
          unit_amount: discountedCoursePrice * 100,
          product_data: { 
            name: course.title, 
            description: finalPromoCode ? `Promo: ${finalPromoCode} applied` : 'Course Enrollment' 
          },
        },
      });
    }

    // Item 2: Platform Fee
    if (platformFee > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: 'inr',
          unit_amount: platformFee * 100,
          product_data: { name: 'Platform Fee' },
        },
      });
    }

    // Item 3: IGST (Tax)
    if (taxAmount > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: 'inr',
          unit_amount: taxAmount * 100,
          product_data: { name: 'IGST (18%)' },
        },
      });
    }

    // Item 4: Donation
    if (donation_amount > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: 'inr',
          unit_amount: donation_amount * 100,
          product_data: { name: 'Support a Cause (Donation)' },
        },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      // FIX: Use automatic_payment_methods for better reliability in India (UPI/Cards)
      payment_method_types: ['card'], 
      // Alternatively, uncomment below to enable all methods automatically:
      // automatic_payment_methods: { enabled: true }, 
      customer_email: userEmail,
      client_reference_id: userId,
      line_items: lineItems,
      metadata: {
        user_id: userId,
        course_id: course.id,
        promocode_id: finalPromoId || '',
        promo_code: finalPromoCode || '',
        donation_amount: donation_amount.toString(),
      },
      success_url: finalSuccessUrl,
      cancel_url: body.cancel_url || `${origin}/courses/${course.slug}?canceled=1`,
    });

    return new Response(JSON.stringify({ url: session.url, id: session.id }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (e: any) {
    console.error('create-checkout-session error', e);
    return new Response(JSON.stringify({ error: e?.message || 'Server error' }), { 
      status: 500, headers: corsHeaders 
    });
  }
});