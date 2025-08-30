import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

// Admin email list - Updated with your email
const ADMIN_EMAILS = [
  'suzainkhan8360@gmail.com',  // Your admin email (lowercase)
  'Suzainkhan8360@gmail.com',  // Your admin email (original case)
  'admin@premiumaccesszone.com',
  'support@premiumaccesszone.com',
  'moderator@premiumaccesszone.com'
]

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Create admin client with service role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Verify the request is from an authenticated admin user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Verify the user token
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Check if user is admin
    console.log('User email:', user.email);
    console.log('ADMIN_EMAILS:', ADMIN_EMAILS);
    const isAdminEmail = ADMIN_EMAILS.some(email => 
      email.toLowerCase() === (user.email || '').toLowerCase()
    )
    console.log('Is admin email:', isAdminEmail);
    
    if (!isAdminEmail) {
      return new Response(
        JSON.stringify({ error: 'Access denied - admin privileges required' }),
        { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const url = new URL(req.url)
    const action = url.searchParams.get('action') || 'list'

    switch (action) {
      case 'list':
        return await handleListPromoCodes(supabaseAdmin)
      case 'redemptions':
        return await handleListRedemptions(supabaseAdmin, url.searchParams.get('code_id'))
      case 'add-single-code':
        return await handleAddSingleCode(supabaseAdmin, req, user.id)
      case 'generate':
        return await handleGenerateCodes(supabaseAdmin, req, user.id)
      case 'toggle':
        return await handleToggleCode(supabaseAdmin, req)
      case 'delete':
        return await handleDeleteCode(supabaseAdmin, req)
      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
    }

  } catch (error) {
    console.error('Admin promo codes function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

async function handleListPromoCodes(supabaseAdmin: any) {
  try {
    // Fetch all promo codes
    const { data, error } = await supabaseAdmin
      .from('promo_codes')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) throw error

    return new Response(
      JSON.stringify(data),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error: any) {
    console.error('Error listing promo codes:', error)
    return new Response(
      JSON.stringify({ error: `Failed to fetch promo codes: ${error.message}` }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}

async function handleListRedemptions(supabaseAdmin: any, codeId: string | null) {
  try {
    // Build query
    let query = supabaseAdmin
      .from('promo_code_redemptions')
      .select(`
        id,
        user_id,
        promo_code_id,
        points_earned,
        created_at,
        profiles!inner(email, full_name),
        promo_codes!inner(code)
      `)
      .order('created_at', { ascending: false })
    
    // Filter by code ID if provided
    if (codeId) {
      query = query.eq('promo_code_id', codeId)
    }
    
    const { data, error } = await query.limit(100)
    
    if (error) throw error

    return new Response(
      JSON.stringify(data),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error: any) {
    console.error('Error listing redemptions:', error)
    return new Response(
      JSON.stringify({ error: `Failed to fetch redemptions: ${error.message}` }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}

async function handleAddSingleCode(supabaseAdmin: any, req: Request, userId: string) {
  try {
    const {
      code,
      points,
      description,
      max_uses,
      starts_at,
      expires_at,
      is_active
    } = await req.json()

    if (!code || !points) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: code, points' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Create codes_data array with single code
    const codes_data = [{
      code: code.toUpperCase(),
      points: parseInt(points),
      description: description || null,
      max_uses: max_uses ? parseInt(max_uses) : null,
      starts_at: starts_at ? new Date(starts_at).toISOString() : null,
      expires_at: expires_at ? new Date(expires_at).toISOString() : null,
      is_active: is_active !== false
      created_by: userId
    }]

    // Call the generate_promo_codes function
    const { data, error } = await supabaseAdmin.rpc('generate_promo_codes', {
      codes_data: codes_data
    })

    if (error) throw error

    return new Response(
      JSON.stringify(data),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error: any) {
    console.error('Error adding single promo code:', error)
    return new Response(
      JSON.stringify({ error: `Failed to add promo code: ${error.message}` }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}

async function handleGenerateCodes(supabaseAdmin: any, req: Request, userId: string) {
  try {
    const {
      count,
      prefix,
      points,
      description,
      max_uses,
      starts_at,
      expires_at
    } = await req.json()

    if (!count || !points) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: count, points' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Generate codes array
    const codes_data = []
    const countNum = parseInt(count)

    for (let i = 1; i <= countNum; i++) {
      const code = `${prefix.toUpperCase()}${Date.now()}${i.toString().padStart(3, '0')}`
      codes_data.push({
        code,
        points: parseInt(points),
        description: description || null,
        max_uses: max_uses ? parseInt(max_uses) : null,
        starts_at: starts_at ? new Date(starts_at).toISOString() : null,
        expires_at: expires_at ? new Date(expires_at).toISOString() : null,
        is_active: true
        created_by: userId
      })
    }

    // Call the generate_promo_codes function
    const { data, error } = await supabaseAdmin.rpc('generate_promo_codes', {
      codes_data: codes_data
    })

    if (error) throw error

    return new Response(
      JSON.stringify(data),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error: any) {
    console.error('Error generating promo codes:', error)
    return new Response(
      JSON.stringify({ error: `Failed to generate promo codes: ${error.message}` }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}

async function handleToggleCode(supabaseAdmin: any, req: Request) {
  try {
    const { id, is_active } = await req.json()

    if (!id) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: id' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Update promo code status
    const { data, error } = await supabaseAdmin
      .from('promo_codes')
      .update({ is_active: !is_active })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return new Response(
      JSON.stringify(data),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error: any) {
    console.error('Error toggling promo code:', error)
    return new Response(
      JSON.stringify({ error: `Failed to update promo code: ${error.message}` }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}

async function handleDeleteCode(supabaseAdmin: any, req: Request) {
  try {
    const { id } = await req.json()

    if (!id) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: id' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Delete promo code
    const { error } = await supabaseAdmin
      .from('promo_codes')
      .delete()
      .eq('id', id)

    if (error) throw error

    return new Response(
      JSON.stringify({ success: true }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error: any) {
    console.error('Error deleting promo code:', error)
    return new Response(
      JSON.stringify({ error: `Failed to delete promo code: ${error.message}` }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}