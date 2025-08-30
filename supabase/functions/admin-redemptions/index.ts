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

// Telegram Configuration (your provided details)
const TELEGRAM_BOT_TOKEN = '7835887829:AAE5f2DlITueV4bPxUw0GfDlY9MBx8LFKrQ';
const TELEGRAM_CHAT_ID = '-1002488531748'; // Channel: @youtubepremium_mod

// Function to send message to Telegram
async function sendTelegramMessage(message: string) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body = {
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: 'HTML' // For bold/italic formatting
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Telegram API error:', errorText);
    } else {
      console.log('Telegram message sent successfully');
    }
  } catch (error) {
    console.error('Failed to send Telegram message:', error);
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing environment variables:', { supabaseUrl: !!supabaseUrl, supabaseServiceKey: !!supabaseServiceKey })
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Create admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Verify the request is from an authenticated user
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
      console.error('Auth error:', authError)
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Check if user is admin (for update/list actions)
    const isAdminEmail = ADMIN_EMAILS.some(email => 
      email.toLowerCase() === (user.email || '').toLowerCase()
    )

    const url = new URL(req.url)
    const action = url.searchParams.get('action') || (req.method === 'GET' ? 'list' : 'update')

    console.log('Processing action:', action, 'Method:', req.method)

    if (req.method === 'GET' && action === 'list') {
      if (!isAdminEmail) {
        return new Response(
          JSON.stringify({ error: 'Access denied - admin privileges required' }),
          { 
            status: 403, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
      return await handleListRedemptions(supabaseAdmin)
    } else if (req.method === 'POST' && action === 'update') {
      if (!isAdminEmail) {
        return new Response(
          JSON.stringify({ error: 'Access denied - admin privileges required' }),
          { 
            status: 403, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
      return await handleUpdateRedemption(supabaseAdmin, req, user)
    } else if (req.method === 'POST' && action === 'create') {
      // For creation, allow any authenticated user (non-admin)
      return await handleCreateRedemption(supabaseAdmin, req, user)
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid action or method' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

  } catch (error) {
    console.error('Admin redemptions function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

async function handleListRedemptions(supabaseAdmin: any) {
  try {
    console.log('Fetching redemption requests...')
    
    // Fetch all redemption requests with user profiles
    const { data, error } = await supabaseAdmin
      .from('redemption_requests')
      .select(`
        *,
        profiles!inner(full_name, email)
      `)
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Database error:', error)
      throw error
    }

    console.log('Successfully fetched', data?.length || 0, 'redemption requests')

    return new Response(
      JSON.stringify(data || []),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error: any) {
    console.error('Error listing redemption requests:', error)
    return new Response(
      JSON.stringify({ error: `Failed to fetch redemption requests: ${error.message}` }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}

async function handleCreateRedemption(supabaseAdmin: any, req: Request, authenticatedUser: any) {
  try {
    const body = await req.json()
    console.log('Create request body:', body)
    
    const { 
      subscription_id, 
      subscription_name, 
      duration, 
      points_cost, 
      user_email, 
      user_country, 
      user_notes 
    } = body

    // Validate required fields
    if (!subscription_id || !subscription_name || !duration || !points_cost || !user_email || !user_country) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Fetch user's profile to check points
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('points, full_name, email')
      .eq('id', authenticatedUser.id)
      .single()

    if (profileError || !profile) {
      throw new Error('Failed to fetch user profile')
    }

    if (profile.points < points_cost) {
      return new Response(
        JSON.stringify({ error: 'Insufficient points' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Insert redemption request
    const { data: redemptionData, error: redemptionError } = await supabaseAdmin
      .from('redemption_requests')
      .insert({
        user_id: authenticatedUser.id,
        subscription_id,
        subscription_name,
        duration,
        points_cost,
        status: 'pending',
        user_email,
        user_country,
        user_notes: user_notes || null,
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (redemptionError) {
      console.error('Database insert error:', redemptionError)
      throw redemptionError
    }

    // Create transaction
    const { error: transactionError } = await supabaseAdmin
      .from('transactions')
      .insert({
        user_id: authenticatedUser.id,
        type: 'redeem',
        points: points_cost,
        description: `Redeemed: ${subscription_name} (${duration})`,
        task_type: 'redemption',
        created_at: new Date().toISOString()
      })

    if (transactionError) {
      await supabaseAdmin.from('redemption_requests').delete().eq('id', redemptionData.id)
      throw transactionError
    }

    // Update profile points
    const { error: profileUpdateError } = await supabaseAdmin
      .from('profiles')
      .update({ points: profile.points - points_cost })
      .eq('id', authenticatedUser.id)

    if (profileUpdateError) {
      throw profileUpdateError
    }

    console.log('Successfully created redemption request:', redemptionData)

    // ✅ SEND Telegram notification (pretty format)
    const fullEmail = profile.email || user_email
    const maskedEmail = fullEmail.length > 5 
      ? `${fullEmail.slice(0, 3)}••••@${fullEmail.split('@')[1]}`
      : `••••@hidden.com`

    const message = `📥 <b>NEW REDEMPTION REQUEST</b> ⚡️\n\n` +
      `📌 <b>Request ID:</b> <code>${redemptionData.id}</code>\n` +
      `👤 <b>User:</b> ${maskedEmail} (Name: ${profile.full_name || 'N/A'})\n\n` +
      `🎁 <b>Subscription:</b> ${subscription_name} (${duration})\n` +
      `🪙 <b>Points Cost:</b> ${points_cost}\n` +
      `🚦 <b>Status:</b> <u>PENDING</u> ${new Date(redemptionData.created_at).toLocaleString()}\n\n` +
      `🌍 <b>Country:</b> ${user_country}\n📝 <b>Notes:</b> ${user_notes || 'None'}\n\n` +
      `📡 <b>Waiting for Admin Approval...</b>\n` +
      `🔗 https://premiumaccesszone.com\n\n` +
      `#PremiumAccessZoneOffical`

    await sendTelegramMessage(message)

    return new Response(
      JSON.stringify(redemptionData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('Error creating redemption request:', error)
    return new Response(
      JSON.stringify({ error: `Failed to create redemption request: ${error.message}` }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}


async function handleUpdateRedemption(supabaseAdmin: any, req: Request, authenticatedUser: any) {
  try {
    const body = await req.json()
    console.log('Update request body:', body)
    
    const { requestId, newStatus, activationCode, instructions } = body

    if (!requestId || !newStatus) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: requestId, newStatus' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const updateData: any = {
      status: newStatus,
      completed_at: ['completed', 'failed', 'cancelled'].includes(newStatus) ? new Date().toISOString() : null
    }

    if (newStatus === 'completed') {
      if (!activationCode) {
        return new Response(
          JSON.stringify({ error: 'Activation code is required for completed status' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
      updateData.activation_code = activationCode
      updateData.instructions = instructions || null
      updateData.expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    }

    const { data, error } = await supabaseAdmin
      .from('redemption_requests')
      .update(updateData)
      .eq('id', requestId)
      .select(`
        *,
        profiles!inner(full_name, email)
      `)
      .single()

    if (error) {
      console.error('Database update error:', error)
      throw error
    }

    // Masked values
    const fullEmail = data.profiles?.email || ''
    const maskedEmail = fullEmail.length > 5 
      ? `${fullEmail.slice(0, 3)}••••@${fullEmail.split('@')[1]}`
      : `••••@hidden.com`

    // Construct pretty formatted Telegram message
    let message = `🎯 <b>REDEMPTION ${newStatus.toUpperCase()}!</b> 🎉\n\n` +
      `📌 <b>Request ID:</b> <code>${data.id}</code>\n` +
      `👤 <b>User:</b> ${maskedEmail} (Name: ${data.profiles?.full_name || 'N/A'})\n\n` +
      `🎁 <b>Subscription:</b> ${data.subscription_name} (${data.duration})\n` +
      `🪙 <b>Points Cost:</b> ${data.points_cost}\n`

    if (data.status === 'completed') {
      message +=
        `🚀 <b>Status:</b> <u>COMPLETED</u> ${new Date(data.completed_at).toLocaleString()}\n` +
        `⏳ <b>Expires:</b> ${new Date(data.expires_at).toLocaleString()}\n\n` +
        `🔑 <b>Activation Code:</b> 🔒 Hidden for security\n` +
        `📘 <b>Instructions:</b> 🔐 Sent privately\n\n` +
        `👤 <b>User details have been sent via private message</b>\n` +
        `🔗 https://premiumaccesszone.com\n`
    } else {
      message += `🚀 <b>Status:</b> <u>${data.status.toUpperCase()}</u> ${new Date().toLocaleString()}\n\n` +
        `🔗 https://premiumaccesszone.com\n`
    }

    message += `\n#PremiumAccessZoneOfficial`

    await sendTelegramMessage(message)

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('Error updating redemption request:', error)
    return new Response(
      JSON.stringify({ error: `Failed to update redemption request: ${error.message}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}