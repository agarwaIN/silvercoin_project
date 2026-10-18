'use strict';

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const notificationService = require('../services/notificationService');

router.use(verifyToken);

/**
 * GET /api/notifications
 * Returns notifications list and unread count for current user
 */
router.get('/', async (req, res) => {
  try {
    const allNotifications = await notificationService.getNotificationsForUser(req.user);
    const unreadCount = await notificationService.getUnreadCount(req.user);

    let notifications = allNotifications;
    if (req.query.unreadOnly === 'true') {
      notifications = notifications.filter(n => !n.isRead);
    }

    const limit = parseInt(req.query.limit, 10);
    const result = limit > 0 ? notifications.slice(0, limit) : notifications;

    return res.json({
      notifications: result,
      total: allNotifications.length,
      unreadCount,
    });
  } catch (err) {
    console.error('[NotificationsRoute] Error listing notifications:', err);
    return res.status(500).json({ message: 'Failed to retrieve notifications' });
  }
});

/**
 * GET /api/notifications/unread-count
 * Returns only the unread notification count
 */
router.get('/unread-count', async (req, res) => {
  try {
    const unreadCount = await notificationService.getUnreadCount(req.user);
    return res.json({ unreadCount });
  } catch (err) {
    console.error('[NotificationsRoute] Error getting unread count:', err);
    return res.status(500).json({ message: 'Failed to retrieve unread count' });
  }
});

/**
 * PATCH /api/notifications/read-all
 * Mark all notifications as read for current user
 */
router.patch('/read-all', async (req, res) => {
  try {
    const result = await notificationService.markAllNotificationsAsRead(req.user);
    const unreadCount = await notificationService.getUnreadCount(req.user);
    return res.json({
      message: 'All notifications marked as read',
      unreadCount,
      ...result,
    });
  } catch (err) {
    console.error('[NotificationsRoute] Error marking all as read:', err);
    return res.status(500).json({ message: 'Failed to mark notifications as read' });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read
 */
router.patch('/:id/read', async (req, res) => {
  try {
    const notificationId = req.params.id;
    await notificationService.markNotificationAsRead(req.user, notificationId);
    const unreadCount = await notificationService.getUnreadCount(req.user);
    return res.json({
      success: true,
      notificationId,
      unreadCount,
    });
  } catch (err) {
    console.error('[NotificationsRoute] Error marking notification as read:', err);
    return res.status(500).json({ message: 'Failed to mark notification as read' });
  }
});

module.exports = router;
