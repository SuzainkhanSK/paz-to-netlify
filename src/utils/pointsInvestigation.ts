// Points Investigation and Debugging Utility - FIXED VERSION
import { supabase, isSupabaseConfigured } from '../lib/supabase'

export interface PointsAuditEntry {
  id: string
  user_id: string
  old_points: number
  new_points: number
  changed_at: string
  changed_by?: string
  reason?: string
  email?: string
}

export interface PointsIssueReport {
  userId: string
  userEmail: string
  currentPoints: number
  totalEarned: number
  unexpectedDeductions: PointsAuditEntry[]
  suspiciousTransactions: any[]
  possibleCauses: string[]
  recommendations: string[]
}

class PointsInvestigator {
  async investigateUserPoints(userId: string): Promise<PointsIssueReport> {
    if (!isSupabaseConfigured) {
      throw new Error('Database not configured')
    }

    try {
      // Get user profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (profileError) throw profileError

      // Get all transactions for this user
      const { data: transactions, error: transactionsError } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (transactionsError) throw transactionsError

      // Get points audit log (if available)
      let auditLog: PointsAuditEntry[] = []
      
      try {
        const { data: auditData, error: auditError } = await supabase
          .from('points_audit_log')
          .select('*')
          .eq('user_id', userId)
          .order('changed_at', { ascending: false })

        if (!auditError && auditData) {
          auditLog = auditData
        }
      } catch (error) {
        // Audit log might not exist, continue without it
        console.warn('Audit log not available:', error)
      }

      // Calculate CORRECT points based on transactions
      const earnedPoints = transactions
        .filter(t => t.type === 'earn')
        .reduce((sum, t) => sum + t.points, 0)
      
      const redeemedPoints = transactions
        .filter(t => t.type === 'redeem')
        .reduce((sum, t) => sum + t.points, 0)

      const correctPoints = Math.max(0, earnedPoints - redeemedPoints)

      // Find issues
      const possibleCauses = []
      const recommendations = []

      // Check for points mismatch
      if (profile.points !== correctPoints) {
        possibleCauses.push(`Points mismatch: User has ${profile.points} but should have ${correctPoints} based on transactions`)
        recommendations.push(`Fix points balance to ${correctPoints}`)
      }

      // Check for total earned mismatch
      if (profile.total_earned !== earnedPoints) {
        possibleCauses.push(`Total earned mismatch: User has ${profile.total_earned} but should have ${earnedPoints}`)
        recommendations.push(`Fix total earned to ${earnedPoints}`)
      }

      // Check for negative points
      if (profile.points < 0) {
        possibleCauses.push('User has negative points (impossible scenario)')
        recommendations.push('Set points to correct positive value')
      }

      // Check for impossible scenario (points > total_earned)
      if (profile.points > profile.total_earned) {
        possibleCauses.push('User has more points than total earned (impossible scenario)')
        recommendations.push('Recalculate both points and total_earned')
      }

      // Find unexpected deductions from audit log
      const unexpectedDeductions = auditLog.filter(entry => {
        const pointsChange = entry.new_points - entry.old_points
        return pointsChange < 0 && !entry.reason?.includes('redemption') && !entry.reason?.includes('admin')
      })

      if (unexpectedDeductions.length > 0) {
        possibleCauses.push(`Found ${unexpectedDeductions.length} unexpected point deductions`)
        recommendations.push('Investigate unauthorized point changes')
      }

      // Find suspicious transactions (duplicates)
      const suspiciousTransactions = transactions.filter(t => {
        const duplicates = transactions.filter(other => 
          other.id !== t.id &&
          other.points === t.points &&
          other.description === t.description &&
          Math.abs(new Date(other.created_at).getTime() - new Date(t.created_at).getTime()) < 60000
        )
        return duplicates.length > 0
      })

      if (suspiciousTransactions.length > 0) {
        possibleCauses.push(`Found ${suspiciousTransactions.length} suspicious duplicate transactions`)
        recommendations.push('Remove duplicate transactions')
      }

      return {
        userId,
        userEmail: profile.email,
        currentPoints: profile.points,
        totalEarned: profile.total_earned,
        unexpectedDeductions,
        suspiciousTransactions,
        possibleCauses,
        recommendations
      }

    } catch (error: any) {
      console.error('Points investigation failed:', error)
      throw error
    }
  }

  async investigateAllUsers(): Promise<PointsIssueReport[]> {
    if (!isSupabaseConfigured) {
      throw new Error('Database not configured')
    }

    try {
      // Get all users
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, points, total_earned')

      if (profilesError) throw profilesError

      const reports: PointsIssueReport[] = []

      for (const profile of profiles) {
        try {
          const report = await this.investigateUserPoints(profile.id)
          
          // Only include users with actual issues
          if (report.possibleCauses.length > 0) {
            reports.push(report)
          }
        } catch (error) {
          console.warn(`Failed to investigate user ${profile.id}:`, error)
        }
      }

      return reports
    } catch (error: any) {
      console.error('Bulk investigation failed:', error)
      throw error
    }
  }

  async fixPointsForUser(userId: string): Promise<boolean> {
    if (!isSupabaseConfigured) {
      throw new Error('Database not configured')
    }

    try {
      console.log(`🔧 Fixing points for user: ${userId}`)

      // Get user's transactions to recalculate correct points
      const { data: transactions, error: transactionsError } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)

      if (transactionsError) throw transactionsError

      // Calculate CORRECT points based on actual transactions
      const earnedPoints = transactions
        .filter(t => t.type === 'earn')
        .reduce((sum, t) => sum + t.points, 0)
      
      const redeemedPoints = transactions
        .filter(t => t.type === 'redeem')
        .reduce((sum, t) => sum + t.points, 0)

      const correctPoints = Math.max(0, earnedPoints - redeemedPoints)
      const correctTotalEarned = earnedPoints

      console.log(`📊 User ${userId}: Earned=${earnedPoints}, Redeemed=${redeemedPoints}, Correct Points=${correctPoints}`)

      // SAFELY update user's points to correct value
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          points: correctPoints,
          total_earned: correctTotalEarned,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)

      if (updateError) throw updateError

      console.log(`✅ Successfully fixed points for user ${userId}`)
      return true
    } catch (error: any) {
      console.error('Failed to fix points for user:', error)
      throw error
    }
  }

  async checkDatabaseIntegrity(): Promise<{
    issues: string[]
    recommendations: string[]
    criticalIssues: boolean
  }> {
    if (!isSupabaseConfigured) {
      throw new Error('Database not configured')
    }

    const issues: string[] = []
    const recommendations: string[] = []

    try {
      console.log('🔍 Starting database integrity check...')

      // Get ALL profiles to check for issues
      const { data: allProfiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, points, total_earned')

      if (profilesError) throw profilesError

      console.log(`📊 Checking ${allProfiles.length} user profiles...`)

      // Check for users with negative points
      const negativePoints = allProfiles.filter(profile => profile.points < 0)
      if (negativePoints.length > 0) {
        issues.push(`${negativePoints.length} users have negative points`)
        recommendations.push('Fix negative points immediately')
      }

      // Check for users with points > total_earned (impossible scenario)
      const impossiblePoints = allProfiles.filter(profile => 
        profile.points > profile.total_earned
      )
      if (impossiblePoints.length > 0) {
        issues.push(`${impossiblePoints.length} users have more points than total earned`)
        recommendations.push('Recalculate points based on transaction history')
      }

      // Check for users with 0 points but have transactions
      let usersWithZeroButHaveTransactions = 0
      for (const profile of allProfiles) {
        if (profile.points === 0 && profile.total_earned > 0) {
          // Quick check if they have earn transactions
          const { data: earnTransactions, error } = await supabase
            .from('transactions')
            .select('id')
            .eq('user_id', profile.id)
            .eq('type', 'earn')
            .limit(1)

          if (!error && earnTransactions && earnTransactions.length > 0) {
            usersWithZeroButHaveTransactions++
          }
        }
      }

      if (usersWithZeroButHaveTransactions > 0) {
        issues.push(`${usersWithZeroButHaveTransactions} users have 0 points but have earning transactions`)
        recommendations.push('CRITICAL: Recalculate points for users with 0 balance but earning history')
      }

      // Check for orphaned transactions
      const { data: orphanedCheck, error: orphanedError } = await supabase
        .from('transactions')
        .select(`
          id,
          user_id,
          profiles!left(id)
        `)
        .is('profiles.id', null)
        .limit(10)

      if (!orphanedError && orphanedCheck && orphanedCheck.length > 0) {
        issues.push(`${orphanedCheck.length}+ transactions have no associated user profile`)
        recommendations.push('Clean up orphaned transactions')
      }

      console.log(`🔍 Integrity check complete: ${issues.length} issues found`)

      return {
        issues,
        recommendations,
        criticalIssues: negativePoints.length > 0 || impossiblePoints.length > 0 || usersWithZeroButHaveTransactions > 0
      }

    } catch (error: any) {
      console.error('Database integrity check failed:', error)
      throw error
    }
  }
}

export const pointsInvestigator = new PointsInvestigator()

// SAFE Emergency fix function that PRESERVES user points
export async function emergencyPointsFix(): Promise<{
  usersFixed: number
  issuesFound: string[]
  errors: string[]
}> {
  const result = {
    usersFixed: 0,
    issuesFound: [],
    errors: []
  }

  if (!isSupabaseConfigured) {
    result.errors.push('Database not configured')
    return result
  }

  try {
    console.log('🚨 EMERGENCY POINTS FIX STARTING - SAFE MODE...')

    // Get all users
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, points, total_earned')

    if (profilesError) {
      result.errors.push(`Failed to fetch profiles: ${profilesError.message}`)
      return result
    }

    console.log(`📊 Checking ${profiles.length} user profiles...`)

    for (const profile of profiles) {
      try {
        // Get user's transaction history
        const { data: transactions, error: transactionsError } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', profile.id)

        if (transactionsError) {
          result.errors.push(`Failed to fetch transactions for ${profile.email}: ${transactionsError.message}`)
          continue
        }

        // Calculate what points SHOULD be based on transactions
        const earnedPoints = transactions
          .filter(t => t.type === 'earn')
          .reduce((sum, t) => sum + t.points, 0)
        
        const redeemedPoints = transactions
          .filter(t => t.type === 'redeem')
          .reduce((sum, t) => sum + t.points, 0)

        const correctPoints = Math.max(0, earnedPoints - redeemedPoints)
        const correctTotalEarned = earnedPoints

        // ONLY fix if user has LESS points than they should (never reduce points)
        const needsPointsFix = profile.points < correctPoints
        const needsTotalEarnedFix = profile.total_earned < correctTotalEarned

        if (needsPointsFix || needsTotalEarnedFix) {
          console.log(`🔧 SAFE FIX for ${profile.email}:`)
          console.log(`   Current Points: ${profile.points} → ${Math.max(profile.points, correctPoints)}`)
          console.log(`   Current Total Earned: ${profile.total_earned} → ${Math.max(profile.total_earned, correctTotalEarned)}`)
          
          // SAFE UPDATE: Only increase points, never decrease
          const safePoints = Math.max(profile.points, correctPoints)
          const safeTotalEarned = Math.max(profile.total_earned, correctTotalEarned)

          const { error: updateError } = await supabase
            .from('profiles')
            .update({
              points: safePoints,
              total_earned: safeTotalEarned,
              updated_at: new Date().toISOString()
            })
            .eq('id', profile.id)

          if (updateError) {
            result.errors.push(`Failed to fix points for ${profile.email}: ${updateError.message}`)
          } else {
            result.usersFixed++
            result.issuesFound.push(
              `SAFE FIX for ${profile.email}: Points ${profile.points} → ${safePoints}, Total Earned ${profile.total_earned} → ${safeTotalEarned}`
            )
          }
        }

      } catch (error: any) {
        result.errors.push(`Error processing ${profile.email}: ${error.message}`)
      }
    }

    console.log(`✅ SAFE EMERGENCY FIX COMPLETE: ${result.usersFixed} users fixed`)

  } catch (error: any) {
    result.errors.push(`Emergency fix failed: ${error.message}`)
  }

  return result
}