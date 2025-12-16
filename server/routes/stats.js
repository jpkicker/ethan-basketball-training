const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { calculateStreak } = require('../services/training');

// All stats routes require authentication
router.use(authenticateToken);

/**
 * GET /api/stats/streak
 * Get current streak
 */
router.get('/streak', async (req, res, next) => {
  try {
    const streak = await calculateStreak(req.prisma, req.user.userId);
    res.json({ streak });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/stats/summary
 * Get overall stats summary
 */
router.get('/summary', async (req, res, next) => {
  try {
    const userId = req.user.userId;

    // Total shooting makes
    const shootingStats = await req.prisma.actualActivity.aggregate({
      where: {
        trainingDay: { userId },
        type: 'shooting'
      },
      _sum: {
        shootingMakes: true
      },
      _count: true
    });

    // Total sessions (all activity types)
    const sessionsCount = await req.prisma.actualActivity.count({
      where: {
        trainingDay: { userId },
        type: {
          in: ['coach_skills', 'coach_weights', 'varsity', 'pickup', 'custom']
        }
      }
    });

    // Days with 200+ makes
    const perfectDays = await req.prisma.actualActivity.count({
      where: {
        trainingDay: { userId },
        type: 'shooting',
        shootingMakes: { gte: 200 }
      }
    });

    const streak = await calculateStreak(req.prisma, userId);

    res.json({
      streak,
      totalMakes: shootingStats._sum.shootingMakes || 0,
      totalSessions: sessionsCount,
      perfectDays,
      shootingDays: shootingStats._count
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/stats/weekly
 * Get weekly stats (last 7 days)
 */
router.get('/weekly', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 6);

    // Get all training days for the week
    const trainingDays = await req.prisma.trainingDay.findMany({
      where: {
        userId,
        date: {
          gte: weekAgo,
          lte: today
        }
      },
      include: {
        plannedActivities: true,
        actualActivities: true
      },
      orderBy: { date: 'asc' }
    });

    // Build daily stats
    const dailyStats = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekAgo);
      date.setDate(weekAgo.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];

      const dayData = trainingDays.find(d => d.date.toISOString().split('T')[0] === dateStr);

      const shootingActivity = dayData?.actualActivities?.find(a => a.type === 'shooting');
      const makes = shootingActivity?.shootingMakes || 0;

      dailyStats.push({
        date: dateStr,
        dayOfWeek: date.getDay(),
        makes,
        completed: makes >= 200
      });
    }

    // Calculate weekly completion percentage
    const completedDays = dailyStats.filter(d => d.completed).length;
    const completionPercentage = Math.round((completedDays / 7) * 100);

    // Calculate consistency (planned vs actual timing)
    let onTime = 0;
    let totalPlanned = 0;

    trainingDays.forEach(day => {
      day.plannedActivities.forEach(planned => {
        totalPlanned++;
        const actual = day.actualActivities.find(a => {
          if (planned.type === 'shooting') return a.type === 'shooting';
          // For pickup/custom, match by position (simplified)
          return a.type === planned.type;
        });

        if (actual?.completedAt && planned.plannedTime) {
          const [ph, pm] = planned.plannedTime.split(':').map(Number);
          const [ah, am] = actual.completedAt.split(':').map(Number);
          const diffMinutes = Math.abs((ah * 60 + am) - (ph * 60 + pm));
          if (diffMinutes <= 30) onTime++;
        }
      });
    });

    const consistencyScore = totalPlanned > 0 ? Math.round((onTime / totalPlanned) * 100) : 0;

    res.json({
      dailyStats,
      completionPercentage,
      consistencyScore,
      totalMakes: dailyStats.reduce((sum, d) => sum + d.makes, 0)
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
