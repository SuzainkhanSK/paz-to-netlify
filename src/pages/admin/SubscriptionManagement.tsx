import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Package, 
  Search, 
  Filter, 
  Plus, 
  Edit, 
  Trash2, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  DollarSign,
  Save,
  X,
  Eye,
  Download,
  Upload,
  Settings,
  Database,
  Coins,
  Tv,
  Smartphone,
  Globe,
  Crown,
  Music
} from 'lucide-react'
import { useAdmin } from '../../contexts/AdminContext'
import { supabase, isSupabaseConfigured } from '../../lib/supabase'
import toast from 'react-hot-toast'

interface SubscriptionAvailability {
  id: string
  subscription_id: string
  duration: string
  points_cost: number
  in_stock: boolean
  created_at: string
  updated_at: string
}

const SubscriptionManagement: React.FC = () => {
  const { hasPermission } = useAdmin()
  const [subscriptions, setSubscriptions] = useState<SubscriptionAvailability[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedSubscription, setSelectedSubscription] = useState<SubscriptionAvailability | null>(null)
  const [processingRequest, setProcessingRequest] = useState<string | null>(null)
  const [newSubscription, setNewSubscription] = useState({
    subscription_id: '',
    duration: '',
    points_cost: '',
    display_name: '',
    description: '',
    category: 'other'
  })
  const [pointsToUpdate, setPointsToUpdate] = useState('')

  useEffect(() => {
    if (hasPermission('system.manage')) {
      fetchSubscriptions()
    }
  }, [hasPermission])

  const fetchSubscriptions = async () => {
    try {
      setLoading(true)
      
      // Get current user session
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('Authentication required')
      }

      // Call admin edge function to fetch all subscriptions
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-subscriptions?action=list`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      )
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch subscriptions')
      }
      
      const data = await response.json()
      
      if (Array.isArray(data)) {
        setSubscriptions(data)
      } else {
        console.error('Unexpected response format:', data)
        setSubscriptions([])
        toast.error('Received invalid data format from server')
      }
    } catch (error) {
      console.error('Failed to fetch subscriptions:', error)
      toast.error('Failed to load subscriptions')
    } finally {
      setLoading(false)
    }
  }

  const toggleSubscriptionStatus = async (id: string, currentStatus: boolean) => {
    if (!hasPermission('system.manage')) {
      toast.error('You do not have permission to manage subscriptions')
      return
    }

    setProcessingRequest(id)

    try {
      // Get current user session
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('Authentication required')
      }

      // Call admin edge function to toggle subscription status
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-subscriptions?action=toggle`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id,
            currentStatus
          })
        }
      )
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update subscription')
      }
      
      const result = await response.json()

      toast.success(`Subscription ${currentStatus ? 'out of stock' : 'in stock'} now`)
      fetchSubscriptions()
    } catch (error) {
      console.error('Failed to toggle subscription status:', error)
      toast.error('Failed to update subscription status')
    } finally {
      setProcessingRequest(null)
    }
  }

  const addNewSubscription = async () => {
    if (!hasPermission('system.manage')) {
      toast.error('You do not have permission to manage subscriptions')
      return
    }

    if (!newSubscription.subscription_id || !newSubscription.duration) {
      toast.error('Subscription ID and duration are required')
      return
    }

    setProcessingRequest('new')

    try {
      // Get current user session
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('Authentication required')
      }

      // Call admin edge function to add new subscription
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-subscriptions?action=add`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            subscription_id: newSubscription.subscription_id.toLowerCase().trim(),
            duration: newSubscription.duration.trim(),
            points_cost: newSubscription.points_cost ? parseInt(newSubscription.points_cost) : null,
            display_name: newSubscription.display_name.trim() || newSubscription.subscription_id.replace(/_/g, ' '),
            description: newSubscription.description.trim() || `Premium ${newSubscription.subscription_id.replace(/_/g, ' ')} subscription`,
            category: newSubscription.category || 'other'
          })
        }
      )
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to add subscription')
      }
      
      const result = await response.json()

      toast.success('Subscription added successfully')
      setShowAddModal(false)
      setNewSubscription({
        subscription_id: '',
        duration: '',
        points_cost: '',
        display_name: '',
        description: '',
        category: 'other'
      })
      fetchSubscriptions()
    } catch (error) {
      console.error('Failed to add subscription:', error)
      toast.error('Failed to add subscription')
    } finally {
      setProcessingRequest(null)
    }
  }

  const updateSubscriptionPoints = async () => {
    if (!selectedSubscription || !hasPermission('system.manage')) {
      return
    }

    const pointsCost = parseInt(pointsToUpdate)
    if (isNaN(pointsCost) || pointsCost <= 0) {
      toast.error('Please enter a valid positive number for points')
      return
    }

    setProcessingRequest(selectedSubscription.id)

    try {
      // Get current user session
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('Authentication required')
      }

      // Call admin edge function to update subscription points
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-subscriptions?action=update-points`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: selectedSubscription.id,
            pointsCost
          })
        }
      )
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update subscription points')
      }
      
      const result = await response.json()

      toast.success('Points updated successfully')
      setShowEditModal(false)
      setPointsToUpdate('')
      setSelectedSubscription(null)
      fetchSubscriptions()
    } catch (error) {
      console.error('Failed to update subscription points:', error)
      toast.error('Failed to update subscription points')
    } finally {
      setProcessingRequest(null)
    }
  }

  const deleteSubscription = async (id: string) => {
    if (!hasPermission('system.manage')) {
      toast.error('You do not have permission to manage subscriptions')
      return
    }

    if (!confirm('Are you sure you want to delete this subscription? This action cannot be undone.')) {
      return
    }

    setProcessingRequest(id)

    try {
      // Get current user session
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('Authentication required')
      }

      // Call admin edge function to delete subscription
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-subscriptions?action=delete`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ id })
        }
      )
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete subscription')
      }

      toast.success('Subscription deleted successfully')
      fetchSubscriptions()
    } catch (error) {
      console.error('Failed to delete subscription:', error)
      toast.error('Failed to delete subscription')
    } finally {
      setProcessingRequest(null)
    }
  }

  const filteredSubscriptions = subscriptions.filter(subscription => {
    return subscription.subscription_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
           subscription.duration.toLowerCase().includes(searchTerm.toLowerCase())
  })

  const getSubscriptionIcon = (subscriptionId: string) => {
    if (subscriptionId.includes('netflix') || subscriptionId.includes('youtube') || 
        subscriptionId.includes('disney') || subscriptionId.includes('prime')) {
      return <Tv className="h-5 w-5 text-blue-400" />
    } else if (subscriptionId.includes('spotify') || subscriptionId.includes('music')) {
      return <Music className="h-5 w-5 text-green-400" />
    } else if (subscriptionId.includes('telegram') || subscriptionId.includes('discord')) {
      return <Smartphone className="h-5 w-5 text-purple-400" />
    } else {
      return <Crown className="h-5 w-5 text-yellow-400" />
    }
  }

  if (!hasPermission('system.manage')) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-16 w-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-gray-300">You do not have permission to access subscription management.</p>
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
              <h1 className="text-2xl font-bold text-white">Subscription Management</h1>
              <p className="text-gray-300">Manage available subscriptions and their status</p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg border border-green-400/30 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add Subscription
              </button>
              <button
                onClick={fetchSubscriptions}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg border border-white/20 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 text-white ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 mb-8">
          <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search subscriptions..."
                className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              />
            </div>

            <div className="flex items-center gap-2 text-gray-300">
              <Database className="h-5 w-5 text-blue-400" />
              <span>{subscriptions.length} subscriptions available</span>
            </div>
          </div>
        </div>

        {/* Subscriptions Table */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/10 border-b border-white/20">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-medium text-gray-300">Subscription</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-gray-300">Duration</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-gray-300">Points Cost</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-gray-300">Status</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-gray-300">Last Updated</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
                        <span className="ml-3 text-gray-300">Loading subscriptions...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredSubscriptions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-400">No subscriptions found</p>
                    </td>
                  </tr>
                ) : (
                  filteredSubscriptions.map((subscription, index) => (
                    <motion.tr
                      key={subscription.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="hover:bg-white/10 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {getSubscriptionIcon(subscription.subscription_id)}
                          <div>
                            <p className="text-white font-medium capitalize">
                              {subscription.subscription_id.replace(/_/g, ' ')}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-white">{subscription.duration}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Coins className="h-4 w-4 text-yellow-400" />
                          <p className="text-white font-medium">{subscription.points_cost || 'Not set'}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          subscription.in_stock ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                          {subscription.in_stock ? (
                            <CheckCircle className="h-3 w-3" />
                          ) : (
                            <XCircle className="h-3 w-3" />
                          )}
                          {subscription.in_stock ? 'In Stock' : 'Out of Stock'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-gray-300 text-sm">
                          {new Date(subscription.updated_at).toLocaleDateString()}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setSelectedSubscription(subscription)
                              setPointsToUpdate(subscription.points_cost?.toString() || '')
                              setShowEditModal(true)
                            }}
                            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => toggleSubscriptionStatus(subscription.id, subscription.in_stock)}
                            disabled={processingRequest === subscription.id}
                            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                          >
                            {processingRequest === subscription.id ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : subscription.in_stock ? (
                              <ToggleRight className="h-4 w-4" />
                            ) : (
                              <ToggleLeft className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            onClick={() => deleteSubscription(subscription.id)}
                            disabled={processingRequest === subscription.id}
                            className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add Subscription Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white/10 backdrop-blur-xl rounded-2xl p-8 border border-white/20 max-w-md w-full"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-white">Add New Subscription</h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Subscription ID</label>
                  <input
                    type="text"
                    value={newSubscription.subscription_id}
                    onChange={(e) => setNewSubscription(prev => ({ ...prev, subscription_id: e.target.value }))}
                    placeholder="e.g., netflix, spotify_premium"
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  />
                  <p className="text-gray-400 text-xs mt-1">
                    Use lowercase with underscores, e.g., "netflix", "youtube_premium"
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Display Name</label>
                  <input
                    type="text"
                    value={newSubscription.display_name || ''}
                    onChange={(e) => setNewSubscription(prev => ({ ...prev, display_name: e.target.value }))}
                    placeholder="e.g., Netflix, Spotify Premium"
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                  <textarea
                    value={newSubscription.description || ''}
                    onChange={(e) => setNewSubscription(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Brief description of the subscription service"
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-none"
                    rows={2}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Duration</label>
                  <select
                    value={newSubscription.duration}
                    onChange={(e) => setNewSubscription(prev => ({ ...prev, duration: e.target.value }))}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  >
                    <option value="">Select duration</option>
                    <option value="1 Month">1 Month</option>
                    <option value="2 Months">2 Months</option>
                    <option value="3 Months">3 Months</option>
                    <option value="6 Months">6 Months</option>
                    <option value="1 Year">1 Year</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Category</label>
                  <select
                    value={newSubscription.category || 'other'}
                    onChange={(e) => setNewSubscription(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  >
                    <option value="streaming">Streaming</option>
                    <option value="music">Music</option>
                    <option value="social">Social</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Points Cost</label>
                  <input
                    type="number"
                    value={newSubscription.points_cost}
                    onChange={(e) => setNewSubscription(prev => ({ ...prev, points_cost: e.target.value }))}
                    placeholder="e.g., 1000"
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={addNewSubscription}
                  disabled={processingRequest === 'new' || !newSubscription.subscription_id || !newSubscription.duration}
                  className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {processingRequest === 'new' ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Add Subscription
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Points Modal */}
      <AnimatePresence>
        {showEditModal && selectedSubscription && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowEditModal(false)} />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white/10 backdrop-blur-xl rounded-2xl p-8 border border-white/20 max-w-md w-full"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-white">Edit Points Cost</h3>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Subscription</label>
                  <p className="text-white font-medium capitalize">
                    {selectedSubscription.subscription_id.replace(/_/g, ' ')} ({selectedSubscription.duration})
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Points Cost</label>
                  <input
                    type="number"
                    value={pointsToUpdate}
                    onChange={(e) => setPointsToUpdate(e.target.value)}
                    placeholder="e.g., 1000"
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={updateSubscriptionPoints}
                  disabled={processingRequest === selectedSubscription.id || !pointsToUpdate}
                  className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {processingRequest === selectedSubscription.id ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Update Points
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default SubscriptionManagement