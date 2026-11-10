import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, createUser, getUsers, updateUser } from '../../api'
import Modal from '../../components/Modal'
import NotReady from '../../components/NotReady'
import Pagination from '../../components/Pagination'
import Spinner from '../../components/Spinner'
import { getDefaultPermissions, SYSTEM_MODULES } from '../../lib/permissions'
import './admin.css'

export default function UsersPage({ auth, onNavigate, onExpired }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toastMessage, setToastMessage] = useState('')

  // Filters
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')

  // Pagination (5 items per page)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 5

  useEffect(() => {
    setPage(0)
  }, [search, roleFilter])

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editPermissionsUser, setEditPermissionsUser] = useState(null)

  // Form State for Create User
  const [formUsername, setFormUsername] = useState('')
  const [formName, setFormName] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formRole, setFormRole] = useState('driver')
  const [formActive, setFormActive] = useState(true)
  const [formPermissions, setFormPermissions] = useState(() => getDefaultPermissions('driver'))
  const [formError, setFormError] = useState('')
  const [formSubmitting, setFormSubmitting] = useState(false)

  // Form State for Edit Permissions Modal
  const [editPermissionsList, setEditPermissionsList] = useState([])
  const [editActiveState, setEditActiveState] = useState(true)
  const [editSubmitting, setEditSubmitting] = useState(false)

  // Fetch users
  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const list = await getUsers(auth.token)
      setUsers(list || [])
    } catch (err) {
      if (err && err.status === 401) { onExpired?.(); return; }
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [auth.token])

  useEffect(() => {
    if (auth?.role === 'owner') {
      fetchUsers()
    }
  }, [auth?.role, fetchUsers])

  // Reset Create Form
  const handleOpenCreateModal = () => {
    setFormUsername('')
    setFormName('')
    setFormPassword('')
    setFormRole('driver')
    setFormActive(true)
    setFormPermissions(getDefaultPermissions('driver'))
    setFormError('')
    setCreateModalOpen(true)
  }

  // When role changes in create form, update default permissions
  const handleRoleChange = (newRole) => {
    setFormRole(newRole)
    setFormPermissions(getDefaultPermissions(newRole))
  }

  // Toggle permission checkbox in create form
  const handleToggleCreatePermission = (modId) => {
    setFormPermissions((prev) =>
      prev.includes(modId) ? prev.filter((p) => p !== modId) : [...prev, modId]
    )
  }

  // Toggle permission checkbox in edit modal
  const handleToggleEditPermission = (modId) => {
    setEditPermissionsList((prev) =>
      prev.includes(modId) ? prev.filter((p) => p !== modId) : [...prev, modId]
    )
  }

  // Submit Create User
  const handleSubmitCreate = async (e) => {
    e.preventDefault()
    setFormError('')

    const username = formUsername.trim()
    if (username.length < 3) {
      setFormError('Username must be at least 3 characters long.')
      return
    }

    if (formPassword.length < 8) {
      setFormError('Password must be at least 8 characters long (required by security policy).')
      return
    }

    setFormSubmitting(true)
    try {
      await createUser(auth.token, {
        username,
        name: formName.trim() || username,
        password: formPassword,
        role: formRole,
        is_active: formActive,
        permissions: formPermissions,
      })
      setCreateModalOpen(false)
      setToastMessage(`✓ User "${username}" created successfully with role ${formRole}.`)
      setTimeout(() => setToastMessage(''), 4000)
      await fetchUsers()
    } catch (err) {
      setFormError(err.message || 'Failed to create user account')
    } finally {
      setFormSubmitting(false)
    }
  }

  // Toggle Active Switch directly in table
  const handleToggleActiveSwitch = async (user) => {
    const nextState = !user.is_active
    try {
      await updateUser(auth.token, user.id, { is_active: nextState })
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, is_active: nextState } : u))
      )
      setToastMessage(`User "${user.username}" is now ${nextState ? 'Active' : 'Inactive'}.`)
      setTimeout(() => setToastMessage(''), 3000)
    } catch (err) {
      setError(err.message || 'Failed to update user status')
    }
  }

  // Open Edit Permissions Modal
  const handleOpenEditModal = (user) => {
    setEditPermissionsUser(user)
    setEditPermissionsList(user.permissions || getDefaultPermissions(user.role))
    setEditActiveState(user.is_active !== false)
  }

  // Submit Edit Permissions
  const handleSubmitEditPermissions = async (e) => {
    e.preventDefault()
    if (!editPermissionsUser) return
    setEditSubmitting(true)
    try {
      await updateUser(auth.token, editPermissionsUser.id, {
        is_active: editActiveState,
        permissions: editPermissionsList,
      })
      setUsers((prev) =>
        prev.map((u) =>
          u.id === editPermissionsUser.id
            ? { ...u, is_active: editActiveState, permissions: editPermissionsList }
            : u
        )
      )
      setEditPermissionsUser(null)
      setToastMessage(`Permissions updated for "${editPermissionsUser.username}".`)
      setTimeout(() => setToastMessage(''), 3000)
    } catch (err) {
      setError(err.message || 'Failed to update permissions')
    } finally {
      setEditSubmitting(false)
    }
  }

  // Filtered Users List
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchSearch =
        (u.username || '').toLowerCase().includes(search.toLowerCase()) ||
        (u.name || '').toLowerCase().includes(search.toLowerCase())
      const matchRole = roleFilter === 'all' || u.role === roleFilter
      return matchSearch && matchRole
    })
  }, [users, search, roleFilter])

  // KPI Metrics
  const stats = useMemo(() => {
    const total = users.length
    const active = users.filter((u) => u.is_active !== false).length
    const inactive = total - active
    const drivers = users.filter((u) => u.role === 'driver').length
    const managers = users.filter((u) => u.role === 'manager').length
    return { total, active, inactive, drivers, managers }
  }, [users])

  // Non-owner guard
  if (auth?.role !== 'owner') {
    return (
      <div className="admin-page-container">
        <div className="customer-card urgent-banner" style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🔒</div>
          <h2>Access Restricted (Owner Only)</h2>
          <p className="muted" style={{ margin: '8px 0 16px 0' }}>
            User provisioning and access management is strictly restricted to Owner accounts.
          </p>
          <button type="button" onClick={() => onNavigate('dispatch')}>
            Return to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-page-container">
      {/* Top Header */}
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">
            <span>🔐</span>
            <span>Users & Staff Access Control</span>
          </h1>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Manage staff credentials, role-based boundaries, and per-module authorization.
          </p>
        </div>

        <button type="button" onClick={handleOpenCreateModal}>
          + Add New User / Staff
        </button>
      </div>

      {toastMessage && (
        <div
          style={{
            background: '#dcfce7',
            borderColor: '#86efac',
            color: '#15803d',
            padding: '10px 14px',
            borderRadius: 8,
            marginBottom: 16,
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          {toastMessage}
        </div>
      )}

      {error && (
        <div
          style={{
            background: '#fee2e2',
            borderColor: '#fca5a5',
            color: '#b91c1c',
            padding: '10px 14px',
            borderRadius: 8,
            marginBottom: 16,
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* KPI Tiles Header */}
      <div className="admin-kpi-grid">
        <div className="admin-kpi-card">
          <div className="admin-kpi-label">Total Users</div>
          <div className="admin-kpi-value">{stats.total}</div>
          <div className="muted" style={{ fontSize: 11 }}>Accounts provisioned</div>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-label">Active Staff</div>
          <div className="admin-kpi-value" style={{ color: '#16a34a' }}>{stats.active}</div>
          <div className="muted" style={{ fontSize: 11 }}>Permitted system sign-in</div>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-label">Drivers on Fleet</div>
          <div className="admin-kpi-value" style={{ color: '#0284c7' }}>{stats.drivers}</div>
          <div className="muted" style={{ fontSize: 11 }}>Route stop execution</div>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-label">Inactive Accounts</div>
          <div className="admin-kpi-value" style={{ color: stats.inactive > 0 ? '#ea580c' : '#64748b' }}>
            {stats.inactive}
          </div>
          <div className="muted" style={{ fontSize: 11 }}>Suspended / Disabled</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="admin-filter-bar">
        <input
          type="text"
          className="admin-search-input"
          placeholder="🔍 Search users by username or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border, #cbd5e1)' }}
        >
          <option value="all">All Roles</option>
          <option value="owner">Owner</option>
          <option value="manager">Manager</option>
          <option value="driver">Driver</option>
          <option value="customer">Customer</option>
          <option value="ceo">CEO</option>
        </select>
      </div>

      {/* Users Table */}
      <div className="admin-table-container">
        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center' }}>
            <Spinner size="lg" message="Loading users & access list..." />
          </div>
        ) : (
          <>
          <table className="admin-table">
            <thead>
              <tr>
                <th>User Account</th>
                <th>Role</th>
                <th>Active Status (Switch)</th>
                <th>Per-Module Permissions</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                    No users matching criteria
                  </td>
                </tr>
              ) : (
                filteredUsers.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((u) => {
                  const isActive = u.is_active !== false
                  return (
                    <tr key={u.id}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{u.username}</div>
                        {u.name && u.name !== u.username && (
                          <div className="muted" style={{ fontSize: 12 }}>{u.name}</div>
                        )}
                      </td>

                      <td>
                        <span className={`role-pill ${u.role}`}>{u.role}</span>
                      </td>

                      <td>
                        {/* Interactive Active Switch */}
                        <div
                          className="switch-wrapper"
                          onClick={() => handleToggleActiveSwitch(u)}
                          title={`Click to ${isActive ? 'deactivate' : 'activate'} user`}
                        >
                          <div className={`switch-track ${isActive ? 'active' : ''}`}>
                            <div className="switch-thumb" />
                          </div>
                          <span className={`switch-label ${isActive ? 'active' : 'inactive'}`}>
                            {isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </td>

                      <td>
                        <div className="permission-tags-wrap">
                          {(u.permissions || []).map((perm) => (
                            <span key={perm} className="permission-tag">
                              {perm}
                            </span>
                          ))}
                          {(u.permissions || []).length === 0 && (
                            <span className="muted" style={{ fontSize: 11 }}>No modules granted</span>
                          )}
                        </div>
                      </td>

                      <td>
                        <span className="muted" style={{ fontSize: 12 }}>
                          {new Date(u.created_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="secondary"
                          style={{ fontSize: 12, padding: '4px 10px' }}
                          onClick={() => handleOpenEditModal(u)}
                        >
                          ⚙️ Permissions
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
          <Pagination
            currentPage={page}
            totalPages={Math.ceil(filteredUsers.length / PAGE_SIZE)}
            totalItems={filteredUsers.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
          </>
        )}
      </div>

      {/* CREATE USER MODAL */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create New User / Staff Account"
      >
        <form onSubmit={handleSubmitCreate}>
          {formError && (
            <div
              style={{
                background: '#fee2e2',
                color: '#b91c1c',
                padding: '8px 12px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                marginBottom: 12,
              }}
            >
              ⚠️ {formError}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                Username *
              </label>
              <input
                type="text"
                required
                value={formUsername}
                onChange={(e) => setFormUsername(e.target.value)}
                placeholder="e.g. driver3, ops_lead"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                Full Name
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Asif Mehmood"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                Role *
              </label>
              <select
                value={formRole}
                onChange={(e) => handleRoleChange(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
              >
                <option value="owner">Owner (Full System Access)</option>
                <option value="manager">Manager (Operations, Sales, Verify)</option>
                <option value="driver">Driver (Delivery Routes)</option>
                <option value="customer">Customer (Portal Self-Service)</option>
                <option value="ceo">CEO (Executive Read-Only)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                Password (At least 8 chars) *
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
              />
              <span className="muted" style={{ fontSize: 11 }}>
                {formPassword.length > 0 && formPassword.length < 8 && (
                  <span style={{ color: '#dc2626' }}>{8 - formPassword.length} more characters needed</span>
                )}
                {formPassword.length >= 8 && <span style={{ color: '#16a34a' }}>✓ Password length OK</span>}
              </span>
            </div>
          </div>

          {/* Active Switch Toggle in Form */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
              Account Status
            </label>
            <div className="switch-wrapper" onClick={() => setFormActive(!formActive)}>
              <div className={`switch-track ${formActive ? 'active' : ''}`}>
                <div className="switch-thumb" />
              </div>
              <span className={`switch-label ${formActive ? 'active' : 'inactive'}`}>
                {formActive ? 'Active (Account can sign in)' : 'Inactive (Access blocked)'}
              </span>
            </div>
          </div>

          {/* Per-Module Permissions Checkboxes */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 700 }}>Per-Module Access Permissions</label>
              <button
                type="button"
                className="ghost"
                style={{ fontSize: 11, padding: 0 }}
                onClick={() => setFormPermissions(SYSTEM_MODULES.map((m) => m.id))}
              >
                Grant All
              </button>
            </div>

            <div className="permissions-checkbox-grid">
              {SYSTEM_MODULES.map((mod) => (
                <label key={mod.id} className="permission-checkbox-item">
                  <input
                    type="checkbox"
                    checked={formPermissions.includes(mod.id)}
                    onChange={() => handleToggleCreatePermission(mod.id)}
                  />
                  <span>{mod.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
            <button
              type="button"
              className="secondary"
              onClick={() => setCreateModalOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" disabled={formSubmitting}>
              {formSubmitting ? 'Creating User...' : 'Create Account'}
            </button>
          </div>
        </form>
      </Modal>

      {/* EDIT PERMISSIONS MODAL */}
      <Modal
        isOpen={Boolean(editPermissionsUser)}
        onClose={() => setEditPermissionsUser(null)}
        title={`Edit Permissions: ${editPermissionsUser?.username}`}
      >
        <form onSubmit={handleSubmitEditPermissions}>
          <div style={{ marginBottom: 14 }}>
            <div className="switch-wrapper" onClick={() => setEditActiveState(!editActiveState)}>
              <div className={`switch-track ${editActiveState ? 'active' : ''}`}>
                <div className="switch-thumb" />
              </div>
              <span className={`switch-label ${editActiveState ? 'active' : 'inactive'}`}>
                {editActiveState ? 'Active Account' : 'Suspended Account'}
              </span>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>
              Module Permissions for {editPermissionsUser?.role} role:
            </label>

            <div className="permissions-checkbox-grid">
              {SYSTEM_MODULES.map((mod) => (
                <label key={mod.id} className="permission-checkbox-item">
                  <input
                    type="checkbox"
                    checked={editPermissionsList.includes(mod.id)}
                    onChange={() => handleToggleEditPermission(mod.id)}
                  />
                  <span>{mod.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
            <button
              type="button"
              className="secondary"
              onClick={() => setEditPermissionsUser(null)}
            >
              Cancel
            </button>
            <button type="submit" disabled={editSubmitting}>
              {editSubmitting ? 'Saving...' : 'Save Permissions'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

