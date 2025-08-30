import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  AlertTriangle, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  Search,
  Download,
  Wrench,
  Database,
  Users,
  TrendingDown,
  TrendingUp,
  Eye,
  Coins,
  History,
  Shield,
  Zap
} from 'lucide-react'
import { useAdmin } from '../../contexts/AdminContext'
import { pointsInvestigator, emergencyPointsFix, type PointsIssueReport } from '../../utils/pointsInvestigation'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

const PointsAuditPage: React.FC = () => {
  const { hasPermission } = useAdmin()
  const [loading, setLoading] = useState(false)
  const [investigating, setInvestigating] = useState(false)
  const [fixing, setFixing] = useState(false)
  const [issueReports, setIssueReports] = useState<PointsIssueReport[]>([])
  const [integrityCheck, setIntegrityCheck] = useState<any>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedUser, setSelectedUser] = useState<PointsIssueReport | null>(null)
  const [showUserModal, setShowUserModal] = useState(false)
  const [emergencyFixResult, setEmergencyFixResult] = useState<any>(null)

  useEffect(() => {
    if (hasPermission('*')) {
      checkDatabaseIntegrity()
    }
  }, [hasPermission])

  const checkDatabaseIntegrity = async () => {
    setLoading(true)
    try {
      const result = await pointsInvestigator.checkDatabaseIntegrity()
      setIntegrityCheck(result)
      
      if (result.criticalIssues) {
        toast.error('🚨 Critical points issues detected!')
      } else if (result.issues.length > 0) {
        toast.error('⚠️ Points issues found')
      } else {
        toast.success('✅ No critical points issues detected')
      }
    } catch (error: any) {
      console.error('Integrity check failed:', error)
      toast.error('Failed to check database integrity')
    } finally {
      setLoading(false)
    }
  }

  const investigateAllUsers = async () => {
    setInvestigating(true)
    try {
      const reports = await pointsInvestigator.investigateAllUsers()
      setIssueReports(reports)
      
      if (reports.length > 0) {
        toast.error(`🚨 Found issues with ${reports.length} users!`)
      } else {
        toast.success('✅ No user-specific issues found')
      }
    } catch (error: any) {
      console.error('Investigation failed:', error)
      toast.error('Failed to investigate user points')
    } finally {
      setInvestigating(false)
    }
  }

  const runEmergencyFix = async () => {
    const confirmed = confirm(
      '🚨 EMERGENCY POINTS FIX\n\n' +
      'This will SAFELY fix points for ALL users based on their transaction history.\n\n' +
      'This action will:\n' +
      '• ONLY INCREASE points if users have less than they should\n' +
      '• NEVER reduce any user\'s points\n' +
      '• Fix discrepancies safely\n' +
      '• Create audit log entries\n\n' +
      'SAFE MODE: No user will lose points!\n\n' +
      'Are you sure you want to proceed?'
    )

    if (!confirmed) return

    setFixing(true)
    try {
      // Use the new safe emergency fix
      const { data: result, error } = await supabase.rpc('emergency_fix_all_user_points')
      
      if (error) throw error
      
      // Handle both array and object responses
      let fixResult
      if (Array.isArray(result)) {
        fixResult = result[0] || { users_checked: 0, users_fixed: 0, issues_found: [] }
        setEmergencyFixResult(fixResult)
      } else {
        fixResult = result || { users_checked: 0, users_fixed: 0, issues_found: [] }
        setEmergencyFixResult(fixResult)
      }
      
      if (fixResult.users_fixed > 0) {
        toast.success(`✅ SAFELY fixed points for ${fixResult.users_fixed} out of ${fixResult.users_checked} users!`)
      }
      
      if (fixResult.issues_found.length === 0) {
        toast.success('✅ All user points are correct!')
      }

      // Refresh data after fix
      await checkDatabaseIntegrity()
      await investigateAllUsers()
      
    } catch (error: any) {
      console.error('Emergency fix failed:', error)
      toast.error(`Emergency fix failed: ${error.message}`)
    } finally {
      setFixing(false)
    }
  }

  const exportReport = () => {
    const csvData = [
      ['User Email', 'Current Points', 'Total Earned', 'Issues Found', 'Recommendations'],
      ...issueReports.map(report => [
        report.userEmail,
        report.currentPoints,
        report.totalEarned,
        report.possibleCauses.join('; '),
        report.recommendations.join('; ')
      ])
    ].map(row => row.join(',')).join('\n')

    const blob = new Blob([csvData], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `points-audit-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Report exported successfully')
  }

  const filteredReports = issueReports.filter(report =>
    report.userEmail.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (!hasPermission('*')) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-16 w-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-gray-300">You need super admin privileges to access points audit.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-indigo-900">
      {/* Header */}
      <div className="bg-black/20 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <Shield className="h-8 w-8 text-red-400" />
                🚨 EMERGENCY POINTS AUDIT
              </h1>
              <p className="text-gray-300">Investigate and fix points auto-deduction issues</p>
            </div>
            <div className="flex items-center gap-4">
              {integrityCheck && (
                <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
                  integrityCheck.criticalIssues ? 'bg-red-500/20 text-red-400' :
                  integrityCheck.issues.length > 0 ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-green-500/20 text-green-400'
                }`}>
                  {integrityCheck.criticalIssues ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : integrityCheck.issues.length > 0 ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : (
                    <CheckCircle className="h-4 w-4" />
                  )}
                  {integrityCheck.criticalIssues ? 'Critical Issues' : 
                   integrityCheck.issues.length > 0 ? 'Issues Found' : 'Healthy'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Emergency Actions */}
        <div className="bg-red-500/20 backdrop-blur-sm rounded-2xl p-6 border border-red-500/30">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="h-6 w-6 text-red-400" />
            <h2 className="text-xl font-bold text-white">🚨 EMERGENCY ACTIONS</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={runEmergencyFix}
              disabled={fixing}
              className="flex items-center justify-center gap-2 px-6 py-4 bg-red-500/30 hover:bg-red-500/40 border border-red-400/50 rounded-xl text-red-200 font-medium transition-colors disabled:opacity-50"
            >
              {fixing ? (
                <RefreshCw className="h-5 w-5 animate-spin" />
              ) : (
                <Wrench className="h-5 w-5" />
              )}
              {fixing ? 'Fixing All Users...' : 'EMERGENCY FIX ALL'}
            </button>

            <button
              onClick={investigateAllUsers}
              disabled={investigating}
              className="flex items-center justify-center gap-2 px-6 py-4 bg-yellow-500/30 hover:bg-yellow-500/40 border border-yellow-400/50 rounded-xl text-yellow-200 font-medium transition-colors disabled:opacity-50"
            >
              {investigating ? (
                <RefreshCw className="h-5 w-5 animate-spin" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
              {investigating ? 'Investigating...' : 'INVESTIGATE ALL USERS'}
            </button>

            <button
              onClick={checkDatabaseIntegrity}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-6 py-4 bg-blue-500/30 hover:bg-blue-500/40 border border-blue-400/50 rounded-xl text-blue-200 font-medium transition-colors disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw className="h-5 w-5 animate-spin" />
              ) : (
                <Database className="h-5 w-5" />
              )}
              {loading ? 'Checking...' : 'CHECK DATABASE'}
            </button>
          </div>
        </div>

        {/* Emergency Fix Results */}
        {emergencyFixResult && (
          <div className="bg-green-500/20 backdrop-blur-sm rounded-2xl p-6 border border-green-500/30">
            <h3 className="text-lg font-bold text-white mb-4">🔧 Emergency Fix Results</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">
                  {emergencyFixResult.users_fixed || emergencyFixResult.usersFixed || 0}
                </div>
                <div className="text-gray-300 text-sm">Users Fixed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400">
                  {emergencyFixResult.users_checked || emergencyFixResult.usersChecked || 0}
                </div>
                <div className="text-gray-300 text-sm">Users Checked</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400">
                  {(emergencyFixResult.issues_found || emergencyFixResult.issuesFound || []).length}
                </div>
                <div className="text-gray-300 text-sm">Issues Found</div>
              </div>
            </div>
            
            {(emergencyFixResult.issues_found || emergencyFixResult.issuesFound || []).length > 0 && (
              <div className="bg-black/30 rounded-xl p-4 max-h-64 overflow-y-auto">
                <h4 className="text-white font-medium mb-2">Issues Fixed:</h4>
                <ul className="space-y-1">
                  {(emergencyFixResult.issues_found || emergencyFixResult.issuesFound || []).map((issue: string, index: number) => (
                    <li key={index} className="text-green-300 text-sm">✅ {issue}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Add debug information for troubleshooting */}
            <div className="mt-4 p-3 bg-black/20 rounded-lg">
              <details className="text-xs">
                <summary className="text-gray-400 cursor-pointer hover:text-white">Debug Info</summary>
                <pre className="text-gray-300 mt-2 overflow-auto">
                  {JSON.stringify(emergencyFixResult, null, 2)}
                </pre>
              </details>
            </div>
          </div>
        )}

        {/* Database Integrity Status */}
        {integrityCheck && (
          <div className={`backdrop-blur-sm rounded-2xl p-6 border ${
            integrityCheck.criticalIssues ? 'bg-red-500/20 border-red-500/30' :
            integrityCheck.issues.length > 0 ? 'bg-yellow-500/20 border-yellow-500/30' :
            'bg-green-500/20 border-green-500/30'
          }`}>
            <h3 className="text-lg font-bold text-white mb-4">🔍 Database Integrity Check</h3>
            
            {integrityCheck.issues.length > 0 ? (
              <div className="space-y-4">
                <div>
                  <h4 className="text-white font-medium mb-2">Issues Found:</h4>
                  <ul className="space-y-1">
                    {integrityCheck.issues.map((issue: string, index: number) => (
                      <li key={index} className="text-red-300 text-sm">❌ {issue}</li>
                    ))}
                  </ul>
                </div>
                
                <div>
                  <h4 className="text-white font-medium mb-2">Recommendations:</h4>
                  <ul className="space-y-1">
                    {integrityCheck.recommendations.map((rec: string, index: number) => (
                      <li key={index} className="text-yellow-300 text-sm">💡 {rec}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-2" />
                <p className="text-green-300">No integrity issues found</p>
              </div>
            )}
          </div>
        )}

        {/* User Issues */}
        {issueReports.length > 0 && (
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">👥 Users with Points Issues</h3>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search users..."
                    className="pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <button
                  onClick={exportReport}
                  className="flex items-center gap-2 px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg border border-green-400/30 transition-colors"
                >
                  <Download className="h-4 w-4" />
                  Export
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {filteredReports.map((report, index) => (
                <motion.div
                  key={report.userId}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-white/10 rounded-xl p-4 border border-white/20 hover:bg-white/15 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center">
                        <AlertTriangle className="h-5 w-5 text-red-400" />
                      </div>
                      <div>
                        <h4 className="text-white font-medium">{report.userEmail}</h4>
                        <p className="text-gray-400 text-sm">
                          Current: {report.currentPoints} points | Total Earned: {report.totalEarned}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <div className="text-right mr-4">
                        <div className="text-red-400 font-bold">{report.possibleCauses.length} issues</div>
                        <div className="text-yellow-400 text-sm">{report.unexpectedDeductions.length} deductions</div>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedUser(report)
                          setShowUserModal(true)
                        }}
                        className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="mt-3 text-sm">
                    <div className="text-red-300 mb-1">Issues:</div>
                    <ul className="text-gray-300 space-y-1">
                      {report.possibleCauses.slice(0, 2).map((cause, i) => (
                        <li key={i}>• {cause}</li>
                      ))}
                      {report.possibleCauses.length > 2 && (
                        <li className="text-gray-400">... and {report.possibleCauses.length - 2} more</li>
                      )}
                    </ul>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
            <div className="flex items-center justify-between mb-2">
              <Users className="h-8 w-8 text-blue-400" />
              <span className="text-blue-400 text-sm font-medium">{issueReports.length}</span>
            </div>
            <h3 className="text-white font-semibold">Users with Issues</h3>
            <p className="text-gray-300 text-sm">Need attention</p>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
            <div className="flex items-center justify-between mb-2">
              <TrendingDown className="h-8 w-8 text-red-400" />
              <span className="text-red-400 text-sm font-medium">
                {issueReports.reduce((sum, r) => sum + r.unexpectedDeductions.length, 0)}
              </span>
            </div>
            <h3 className="text-white font-semibold">Unexpected Deductions</h3>
            <p className="text-gray-300 text-sm">Unauthorized point losses</p>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
            <div className="flex items-center justify-between mb-2">
              <Database className="h-8 w-8 text-purple-400" />
              <span className="text-purple-400 text-sm font-medium">
                {integrityCheck?.issues.length || 0}
              </span>
            </div>
            <h3 className="text-white font-semibold">Database Issues</h3>
            <p className="text-gray-300 text-sm">System-level problems</p>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
            <div className="flex items-center justify-between mb-2">
              <Zap className="h-8 w-8 text-yellow-400" />
              <span className="text-yellow-400 text-sm font-medium">
                {emergencyFixResult?.usersFixed || 0}
              </span>
            </div>
            <h3 className="text-white font-semibold">Users Fixed</h3>
            <p className="text-gray-300 text-sm">Last emergency fix</p>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-blue-500/20 backdrop-blur-sm rounded-2xl p-6 border border-blue-500/30">
          <h3 className="text-lg font-bold text-white mb-4">🔧 How to Fix Points Issues</h3>
          <ol className="space-y-2 text-blue-200">
            <li>1. <strong>Run Database Integrity Check</strong> - Identifies system-level issues</li>
            <li>2. <strong>Investigate All Users</strong> - Finds users with points discrepancies</li>
            <li>3. <strong>Emergency Fix All</strong> - Automatically recalculates and fixes all user points</li>
            <li>4. <strong>Monitor Results</strong> - Check the audit log and user feedback</li>
          </ol>
          
          <div className="mt-4 p-4 bg-blue-400/20 rounded-xl border border-blue-400/30">
            <p className="text-blue-300 text-sm">
              <strong>⚡ Emergency Fix</strong> recalculates each user's points based on their transaction history 
              and corrects any discrepancies. This is the fastest way to resolve points issues.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PointsAuditPage