import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Ticket, 
  Search, 
  Filter, 
  Plus, 
  Edit, 
  Trash2, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  RefreshCw,
  Calendar,
  Clock,
  Copy,
  Check,
  Download,
  Upload,
  Save,
  X,
  Coins,
  Users,
  FileText,
  BarChart3,
  Settings,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import { useAdmin } from '../../contexts/AdminContext'
import { supabase, isSupabaseConfigured } from '../../lib/supabase'
import toast from 'react-hot-toast'

interface PromoCode {
  id: string
  code: string
  points: number
  description?: string
  max_uses?: number
  current_uses: number
  starts_at?: string
  expires_at?: string
  created_at: string
  is_active: boolean
}

interface PromoCodeRedemption {
  id: string
  user_id: string
  promo_code_id: string
  points_earned: number
  created_at: string
  profiles?: {
    email: string
    full_name?: string
  }
  promo_codes?: {
    code: string
  }
}

const PromoCodeManagement: React.FC = () => {
  const { hasPermission } = useAdmin()
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([])
  const [redemptions, setRedemptions] = useState<PromoCodeRedemption[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive' | 'expired'>('all')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [editingCode, setEditingCode] = useState<PromoCode | null>(null)
  const [processingRequest, setProcessingRequest] = useState<string | null>(null)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [showRedemptions, setShowRedemptions] = useState(false)
  const [selectedView, setSelectedView] = useState<'codes' | 'redemptions' | 'analytics'>('codes')

  const [newPromoCode, setNewPromoCode] = useState({
    code: '',
    points: '',
    description: '',
    max_uses: '',
    starts_at: new Date().toISOString().split('T')[0],
    expires_at: '',
    is_active: true
  })

  const [bulkGeneration, setBulkGeneration] = useState({
    prefix: 'PAZ',
    count: '10',
    points: '',
    description: '',
    max_uses: '',
    expires_at: ''
  })

  useEffect(() => {
    if (!isSupabaseConfigured) {
      toast.error('Database not configured')
      return
    }

    fetchPromoCodes()
    fetchRedemptions()
  }, [])

  const fetchPromoCodes = async () => {
    try {
      const { data, error } = await supabase
        .from('promo_codes')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setPromoCodes(data || [])
    } catch (error: any) {
      console.error('Failed to fetch promo codes:', error)
      toast.error('Failed to fetch promo codes')
    } finally {
      setLoading(false)
    }
  }

  const fetchRedemptions = async () => {
    try {
      const { data, error } = await supabase
        .from('promo_code_redemptions')
        .select(`
          *,
          profiles!inner(email, full_name),
          promo_codes!inner(code)
        `)
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw error
      setRedemptions(data || [])
    } catch (error: any) {
      console.error('Failed to fetch redemptions:', error)
    }
  }

  const handleAddPromoCode = async () => {
    if (!hasPermission('system.manage')) {
      toast.error('You do not have permission to manage promo codes')
      return
    }

    if (!newPromoCode.code || !newPromoCode.points) {
      toast.error('Code and points are required')
      return
    }

    setProcessingRequest('new')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        toast.error('Authentication required')
        return
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-promo-codes?action=add-single-code`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newPromoCode)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to add promo code')
      }

      const data = await response.json()

      toast.success('Promo code added successfully')
      setShowAddModal(false)
      setNewPromoCode({
        code: '',
        points: '',
        description: '',
        max_uses: '',
        starts_at: new Date().toISOString().split('T')[0],
        expires_at: '',
        is_active: true
      })
      fetchPromoCodes()
    } catch (error: any) {
      console.error('Failed to add promo code:', error)
      
      if (error.message?.includes('unique constraint') || error.message?.includes('already exists')) {
        toast.error('A promo code with this code already exists')
      } else {
        toast.error('Failed to add promo code')
      }
    } finally {
      setProcessingRequest(null)
    }
  }

  const handleBulkGenerate = async () => {
    if (!hasPermission('system.manage')) {
      toast.error('You do not have permission to manage promo codes')
      return
    }

    if (!bulkGeneration.count || !bulkGeneration.points) {
      toast.error('Count and points are required')
      return
    }

    setProcessingRequest('bulk')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        toast.error('Authentication required')
        return
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-promo-codes?action=generate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bulkGeneration)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to generate promo codes')
      }

      const data = await response.json()

      toast.success(`${bulkGeneration.count} promo codes generated successfully`)
      setShowBulkModal(false)
      setBulkGeneration({
        prefix: 'PAZ',
        count: '10',
        points: '',
        description: '',
        max_uses: '',
        expires_at: ''
      })
      fetchPromoCodes()
    } catch (error: any) {
      console.error('Failed to generate promo codes:', error)
      toast.error('Failed to generate promo codes')
    } finally {
      setProcessingRequest(null)
    }
  }

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    if (!hasPermission('system.manage')) {
      toast.error('You do not have permission to manage promo codes')
      return
    }

    setProcessingRequest(id)

    try {
      const { error } = await supabase
        .from('promo_codes')
        .update({ is_active: !currentStatus })
        .eq('id', id)

      if (error) throw error

      toast.success(`Promo code ${!currentStatus ? 'activated' : 'deactivated'}`)
      fetchPromoCodes()
    } catch (error: any) {
      console.error('Failed to update promo code:', error)
      toast.error('Failed to update promo code')
    } finally {
      setProcessingRequest(null)
    }
  }

  const handleDeleteCode = async (id: string) => {
    if (!hasPermission('system.manage')) {
      toast.error('You do not have permission to manage promo codes')
      return
    }

    if (!confirm('Are you sure you want to delete this promo code?')) {
      return
    }

    setProcessingRequest(id)

    try {
      const { error } = await supabase
        .from('promo_codes')
        .delete()
        .eq('id', id)

      if (error) throw error

      toast.success('Promo code deleted successfully')
      fetchPromoCodes()
    } catch (error: any) {
      console.error('Failed to delete promo code:', error)
      toast.error('Failed to delete promo code')
    } finally {
      setProcessingRequest(null)
    }
  }

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedCode(id)
      toast.success('Code copied to clipboard')
      setTimeout(() => setCopiedCode(null), 2000)
    } catch (error) {
      toast.error('Failed to copy code')
    }
  }

  const exportCodes = () => {
    const csvContent = [
      ['Code', 'Points', 'Description', 'Max Uses', 'Current Uses', 'Status', 'Expires At', 'Created At'],
      ...filteredCodes.map(code => [
        code.code,
        code.points,
        code.description || '',
        code.max_uses || '',
        code.current_uses,
        code.is_active ? 'Active' : 'Inactive',
        code.expires_at ? new Date(code.expires_at).toLocaleDateString() : '',
        new Date(code.created_at).toLocaleDateString()
      ])
    ].map(row => row.join(',')).join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `promo-codes-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportRedemptions = () => {
    const csvContent = [
      ['Code', 'User Email', 'User Name', 'Points Earned', 'Redeemed At'],
      ...redemptions.map(redemption => [
        redemption.promo_codes?.code || '',
        redemption.profiles?.email || '',
        redemption.profiles?.full_name || '',
        redemption.points_earned,
        new Date(redemption.created_at).toLocaleDateString()
      ])
    ].map(row => row.join(',')).join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `promo-redemptions-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const filteredCodes = promoCodes.filter(code => {
    const matchesSearch = code.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (code.description && code.description.toLowerCase().includes(searchTerm.toLowerCase()))
    
    const matchesFilter = filterStatus === 'all' || 
                         (filterStatus === 'active' && code.is_active) ||
                         (filterStatus === 'inactive' && !code.is_active) ||
                         (filterStatus === 'expired' && code.expires_at && new Date(code.expires_at) < new Date())
    
    return matchesSearch && matchesFilter
  })

  const stats = {
    totalCodes: promoCodes.length,
    activeCodes: promoCodes.filter(c => c.is_active).length,
    totalRedemptions: redemptions.length,
    totalPointsRedeemed: redemptions.reduce((sum, r) => sum + r.points_earned, 0)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Ticket className="h-8 w-8 text-blue-600" />
            Promo Code Management
          </h1>
          <p className="text-gray-600 mt-1">Create and manage promotional codes for your platform</p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <motion.button
            onClick={() => setShowAddModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Plus className="h-4 w-4" />
            Add Code
          </motion.button>
          
          <motion.button
            onClick={() => setShowBulkModal(true)}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Upload className="h-4 w-4" />
            Bulk Generate
          </motion.button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Codes</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalCodes}</p>
            </div>
            <Ticket className="h-8 w-8 text-blue-600" />
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Codes</p>
              <p className="text-2xl font-bold text-green-600">{stats.activeCodes}</p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Redemptions</p>
              <p className="text-2xl font-bold text-purple-600">{stats.totalRedemptions}</p>
            </div>
            <Users className="h-8 w-8 text-purple-600" />
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Points Redeemed</p>
              <p className="text-2xl font-bold text-orange-600">{stats.totalPointsRedeemed.toLocaleString()}</p>
            </div>
            <Coins className="h-8 w-8 text-orange-600" />
          </div>
        </div>
      </div>

      {/* View Tabs */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'codes', name: 'Promo Codes', icon: Ticket },
              { id: 'redemptions', name: 'Redemptions', icon: Users },
              { id: 'analytics', name: 'Analytics', icon: BarChart3 }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedView(tab.id as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                  selectedView === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {selectedView === 'codes' && (
            <div className="space-y-4">
              {/* Search and Filter */}
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <input
                    type="text"
                    placeholder="Search codes..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as any)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="expired">Expired</option>
                </select>
                
                <motion.button
                  onClick={exportCodes}
                  className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Download className="h-4 w-4" />
                  Export
                </motion.button>
              </div>

              {/* Codes Table */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Points</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usage</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expires</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredCodes.map((code) => (
                      <tr key={code.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-medium text-gray-900">{code.code}</span>
                            <button
                              onClick={() => copyToClipboard(code.code, code.id)}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              {copiedCode === code.id ? (
                                <Check className="h-4 w-4 text-green-600" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                          {code.description && (
                            <p className="text-sm text-gray-500 mt-1">{code.description}</p>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-gray-900">{code.points}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-900">
                            {code.current_uses}{code.max_uses ? `/${code.max_uses}` : ''}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            code.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {code.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {code.expires_at ? new Date(code.expires_at).toLocaleDateString() : 'Never'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleToggleStatus(code.id, code.is_active)}
                              disabled={processingRequest === code.id}
                              className={`${
                                code.is_active ? 'text-red-600 hover:text-red-900' : 'text-green-600 hover:text-green-900'
                              } disabled:opacity-50`}
                            >
                              {code.is_active ? <XCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                            </button>
                            <button
                              onClick={() => handleDeleteCode(code.id)}
                              disabled={processingRequest === code.id}
                              className="text-red-600 hover:text-red-900 disabled:opacity-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {selectedView === 'redemptions' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">Recent Redemptions</h3>
                <motion.button
                  onClick={exportRedemptions}
                  className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Download className="h-4 w-4" />
                  Export
                </motion.button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Points</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {redemptions.map((redemption) => (
                      <tr key={redemption.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="font-mono text-sm font-medium text-gray-900">
                            {redemption.promo_codes?.code}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {redemption.profiles?.full_name || 'Unknown'}
                            </div>
                            <div className="text-sm text-gray-500">{redemption.profiles?.email}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-gray-900">{redemption.points_earned}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(redemption.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {selectedView === 'analytics' && (
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-gray-900">Analytics Overview</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-50 p-6 rounded-lg">
                  <h4 className="text-md font-medium text-gray-900 mb-4">Code Usage Statistics</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Total Codes Created:</span>
                      <span className="text-sm font-medium">{stats.totalCodes}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Active Codes:</span>
                      <span className="text-sm font-medium text-green-600">{stats.activeCodes}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Inactive Codes:</span>
                      <span className="text-sm font-medium text-red-600">{stats.totalCodes - stats.activeCodes}</span>
                    </div>
                  </div>
                </div>
                
                <div className="bg-gray-50 p-6 rounded-lg">
                  <h4 className="text-md font-medium text-gray-900 mb-4">Redemption Statistics</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Total Redemptions:</span>
                      <span className="text-sm font-medium">{stats.totalRedemptions}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Points Distributed:</span>
                      <span className="text-sm font-medium text-blue-600">{stats.totalPointsRedeemed.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Avg Points per Redemption:</span>
                      <span className="text-sm font-medium">
                        {stats.totalRedemptions > 0 ? Math.round(stats.totalPointsRedeemed / stats.totalRedemptions) : 0}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Promo Code Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-lg p-6 w-full max-w-md"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">Add New Promo Code</h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
                  <input
                    type="text"
                    value={newPromoCode.code}
                    onChange={(e) => setNewPromoCode({ ...newPromoCode, code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter promo code"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Points *</label>
                  <input
                    type="number"
                    value={newPromoCode.points}
                    onChange={(e) => setNewPromoCode({ ...newPromoCode, points: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Points to award"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input
                    type="text"
                    value={newPromoCode.description}
                    onChange={(e) => setNewPromoCode({ ...newPromoCode, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Optional description"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Uses</label>
                  <input
                    type="number"
                    value={newPromoCode.max_uses}
                    onChange={(e) => setNewPromoCode({ ...newPromoCode, max_uses: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Leave empty for unlimited"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expires At</label>
                  <input
                    type="date"
                    value={newPromoCode.expires_at}
                    onChange={(e) => setNewPromoCode({ ...newPromoCode, expires_at: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={newPromoCode.is_active}
                    onChange={(e) => setNewPromoCode({ ...newPromoCode, is_active: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="is_active" className="ml-2 block text-sm text-gray-900">
                    Active
                  </label>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddPromoCode}
                  disabled={processingRequest === 'new'}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {processingRequest === 'new' && <RefreshCw className="h-4 w-4 animate-spin" />}
                  Add Code
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk Generate Modal */}
      <AnimatePresence>
        {showBulkModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-lg p-6 w-full max-w-md"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">Bulk Generate Codes</h3>
                <button
                  onClick={() => setShowBulkModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prefix</label>
                  <input
                    type="text"
                    value={bulkGeneration.prefix}
                    onChange={(e) => setBulkGeneration({ ...bulkGeneration, prefix: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Code prefix"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Count *</label>
                  <input
                    type="number"
                    value={bulkGeneration.count}
                    onChange={(e) => setBulkGeneration({ ...bulkGeneration, count: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Number of codes to generate"
                    min="1"
                    max="100"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Points *</label>
                  <input
                    type="number"
                    value={bulkGeneration.points}
                    onChange={(e) => setBulkGeneration({ ...bulkGeneration, points: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Points per code"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input
                    type="text"
                    value={bulkGeneration.description}
                    onChange={(e) => setBulkGeneration({ ...bulkGeneration, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Optional description"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Uses per Code</label>
                  <input
                    type="number"
                    value={bulkGeneration.max_uses}
                    onChange={(e) => setBulkGeneration({ ...bulkGeneration, max_uses: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Leave empty for unlimited"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expires At</label>
                  <input
                    type="date"
                    value={bulkGeneration.expires_at}
                    onChange={(e) => setBulkGeneration({ ...bulkGeneration, expires_at: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowBulkModal(false)}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkGenerate}
                  disabled={processingRequest === 'bulk'}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {processingRequest === 'bulk' && <RefreshCw className="h-4 w-4 animate-spin" />}
                  Generate
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default PromoCodeManagement