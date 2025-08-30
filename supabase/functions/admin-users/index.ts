import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

interface UserData {
  id: string
  email: string
  full_name?: string
  points: number
  total_earned: number
  created_at: string
  status: 'active' | 'banned' | 'suspended'
  last_login?: string
  transaction_count?: number
  task_count?: number
  email_confirmed_at?: string
  has_profile: boolean
}

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
    // Check if user email is in admin list (case-insensitive)
    const ADMIN_EMAILS = [
      'suzainkhan8360@gmail.com',  // Your admin email (lowercase)
      'Suzainkhan8360@gmail.com',  // Your admin email (original case)
      'admin@premiumaccesszone.com',
      'support@premiumaccesszone.com',
      'moderator@premiumaccesszone.com'
    ]
    
    const isAdminEmail = ADMIN_EMAILS.some(email => 
      email.toLowerCase() === (user.email || '').toLowerCase()
    )
    
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
        return await handleListUsers(supabaseAdmin)
      case 'recent-activity':
        return await handleRecentActivity(supabaseAdmin)
      case 'update-points':
        return await handleUpdatePoints(supabaseAdmin, req)
      case 'update-status':
        return await handleUpdateStatus(supabaseAdmin, req)
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
    console.error('Admin users function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

async function handleListUsers(supabaseAdmin: any) {
  try {
    // First, refresh the materialized view for up-to-date stats
    try {
      await supabaseAdmin.rpc('refresh_user_stats');
    } catch (refreshError) {
      console.warn('Failed to refresh user stats, using existing data:', refreshError);
    }

    // Fetch all users with statistics from the materialized view (much faster)
    const { data: profilesData, error: profilesError } = await supabaseAdmin
      .from('user_stats_summary')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (profilesError) {
      throw profilesError;
    }
    
    // Transform the data to match the expected UserData interface
    const usersWithStats: UserData[] = (profilesData || []).map(profile => ({
      id: profile.user_id,
      email: profile.email,
      full_name: profile.full_name,
      points: profile.points,
      total_earned: profile.total_earned,
      created_at: profile.created_at,
      status: 'active', // Default to active since we can't easily check banned status
      has_profile: true,
      transaction_count: profile.transaction_count || 0,
      task_count: profile.task_count || 0
    }));

    return new Response(
      JSON.stringify({ users: usersWithStats }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error: any) {
    console.error('Error listing users:', error)
    return new Response(
      JSON.stringify({ error: `Failed to fetch users: ${error.message}` }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}

async function handleRecentActivity(supabaseAdmin: any) {
  try {
    // Get recent transactions
    const { data: transactions, error: transactionsError } = await supabaseAdmin
      .from('transactions')
      .select(`
        id,
        user_id,
        type,
        points,
        description,
        task_type,
        created_at,
        profiles!inner(email)
      `)
      .order('created_at', { ascending: false })
      .limit(10)
    
    if (transactionsError) throw transactionsError

    // Get recent redemptions
    const { data: redemptions, error: redemptionsError } = await supabaseAdmin
      .from('redemption_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)
    
    if (redemptionsError) throw redemptionsError

    // Format transactions for response
    const formattedTransactions = transactions.map((t: any) => ({
      id: t.id,
      user_id: t.user_id,
      type: t.type,
      points: t.points,
      description: t.description,
      task_type: t.task_type,
      created_at: t.created_at,
      user_email: t.profiles.email
    }))

    return new Response(
      JSON.stringify({ 
        transactions: formattedTransactions,
        redemptions: redemptions
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error: any) {
    console.error('Error fetching recent activity:', error)
    return new Response(
      JSON.stringify({ error: `Failed to fetch recent activity: ${error.message}` }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}

async function handleUpdatePoints(supabaseAdmin: any, req: Request) {
  try {
    const { userId, pointsToAdd, description } = await req.json()

    if (!userId || typeof pointsToAdd !== 'number' || !description) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: userId, pointsToAdd, description' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Use the safe admin function to adjust points
    const { data, error } = await supabaseAdmin.rpc('admin_adjust_user_points', {
      user_id_param: userId,
      points_change: pointsToAdd,
      description_param: description
    })

    if (error) throw error

    if (!data.success) {
      return new Response(
        JSON.stringify({ error: data.message }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: data.message,
        points_change: data.points_change,
        old_points: data.old_points,
        new_points: data.new_points
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error: any) {
    console.error('Error updating points:', error)
    return new Response(
      JSON.stringify({ error: `Failed to update points: ${error.message}` }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}

async function handleUpdateStatus(supabaseAdmin: any, req: Request) {
  try {
    const { userId, action } = await req.json()

    if (!userId || !action) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: userId, action' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Update user status in auth.users
    let updateData: any = {}
    
    switch (action) {
      case 'ban':
        updateData.ban_duration = 'permanent'
        break
      case 'unban':
        updateData.ban_duration = 'none'
        break
      case 'suspend':
        updateData.ban_duration = '24h'
        break
      case 'activate':
        updateData.ban_duration = 'none'
        break
      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, updateData)
    
    if (error) throw error

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `User ${action}ned successfully` 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error: any) {
    console.error('Error updating user status:', error)
    return new Response(
      JSON.stringify({ error: `Failed to update user status: ${error.message}` }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}