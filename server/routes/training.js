const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { getOrCreateTrainingDay, formatTrainingDayResponse } = require('../services/training');

// All training routes require authentication
router.use(authenticateToken);

/**
 * GET /api/training/:date
 * Get training day data (creates if not exists)
 */
router.get('/:date', async (req, res, next) => {
  try {
    const { date } = req.params;

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const trainingDay = await getOrCreateTrainingDay(req.prisma, req.user.userId, date);
    res.json(formatTrainingDayResponse(trainingDay));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/training
 * Get training days for a date range
 */
router.get('/', async (req, res, next) => {
  try {
    const { start, end } = req.query;

    if (!start || !end) {
      return res.status(400).json({ error: 'start and end query params required' });
    }

    const startDate = new Date(start + 'T00:00:00.000Z');
    const endDate = new Date(end + 'T23:59:59.999Z');

    const trainingDays = await req.prisma.trainingDay.findMany({
      where: {
        userId: req.user.userId,
        date: {
          gte: startDate,
          lte: endDate
        }
      },
      include: {
        plannedActivities: true,
        actualActivities: true
      },
      orderBy: { date: 'asc' }
    });

    res.json(trainingDays.map(formatTrainingDayResponse));
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/training/:date
 * Update training day (game day toggle, etc.)
 */
router.put('/:date', async (req, res, next) => {
  try {
    const { date } = req.params;
    const { isGameDay } = req.body;

    const trainingDay = await getOrCreateTrainingDay(req.prisma, req.user.userId, date);

    const updated = await req.prisma.trainingDay.update({
      where: { id: trainingDay.id },
      data: { isGameDay: isGameDay ?? trainingDay.isGameDay },
      include: {
        plannedActivities: true,
        actualActivities: true
      }
    });

    res.json(formatTrainingDayResponse(updated));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/training/:date/planned
 * Add a planned activity
 */
router.post('/:date/planned', async (req, res, next) => {
  try {
    const { date } = req.params;
    const { type, time, location, name } = req.body;

    if (!type || !time) {
      return res.status(400).json({ error: 'type and time are required' });
    }

    if (!['shooting', 'pickup', 'custom'].includes(type)) {
      return res.status(400).json({ error: 'Invalid activity type' });
    }

    const trainingDay = await getOrCreateTrainingDay(req.prisma, req.user.userId, date);

    // For shooting, remove existing planned shooting first
    if (type === 'shooting') {
      await req.prisma.plannedActivity.deleteMany({
        where: {
          trainingDayId: trainingDay.id,
          type: 'shooting'
        }
      });
    }

    await req.prisma.plannedActivity.create({
      data: {
        trainingDayId: trainingDay.id,
        type,
        plannedTime: time,
        location: type === 'pickup' ? location : null,
        name: type === 'custom' ? name : null
      }
    });

    // Fetch updated training day
    const updated = await req.prisma.trainingDay.findUnique({
      where: { id: trainingDay.id },
      include: {
        plannedActivities: true,
        actualActivities: true
      }
    });

    res.status(201).json(formatTrainingDayResponse(updated));
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/training/:date/planned/:activityId
 * Remove a planned activity
 */
router.delete('/:date/planned/:activityId', async (req, res, next) => {
  try {
    const { date, activityId } = req.params;

    // Verify ownership
    const activity = await req.prisma.plannedActivity.findUnique({
      where: { id: activityId },
      include: {
        trainingDay: true
      }
    });

    if (!activity || activity.trainingDay.userId !== req.user.userId) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    await req.prisma.plannedActivity.delete({
      where: { id: activityId }
    });

    // Fetch updated training day
    const updated = await req.prisma.trainingDay.findUnique({
      where: { id: activity.trainingDayId },
      include: {
        plannedActivities: true,
        actualActivities: true
      }
    });

    res.json(formatTrainingDayResponse(updated));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/training/:date/actual
 * Log an actual activity completion
 */
router.post('/:date/actual', async (req, res, next) => {
  try {
    const { date } = req.params;
    const { type, completedAt, shootingMakes } = req.body;

    if (!type) {
      return res.status(400).json({ error: 'type is required' });
    }

    const validTypes = ['shooting', 'pickup', 'custom', 'coach_skills', 'coach_weights', 'varsity'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid activity type' });
    }

    const trainingDay = await getOrCreateTrainingDay(req.prisma, req.user.userId, date);

    // For fixed activities (coach, varsity), toggle or create
    if (['coach_skills', 'coach_weights', 'varsity'].includes(type)) {
      const existing = await req.prisma.actualActivity.findFirst({
        where: {
          trainingDayId: trainingDay.id,
          type
        }
      });

      if (existing) {
        // Toggle off - delete it
        await req.prisma.actualActivity.delete({
          where: { id: existing.id }
        });
      } else {
        // Toggle on - create it
        await req.prisma.actualActivity.create({
          data: {
            trainingDayId: trainingDay.id,
            type,
            completedAt: completedAt || new Date().toTimeString().slice(0, 5)
          }
        });
      }
    } else if (type === 'shooting') {
      // Upsert shooting activity
      const existing = await req.prisma.actualActivity.findFirst({
        where: {
          trainingDayId: trainingDay.id,
          type: 'shooting'
        }
      });

      if (existing) {
        await req.prisma.actualActivity.update({
          where: { id: existing.id },
          data: {
            shootingMakes: shootingMakes ?? existing.shootingMakes,
            completedAt: completedAt ?? existing.completedAt
          }
        });
      } else {
        await req.prisma.actualActivity.create({
          data: {
            trainingDayId: trainingDay.id,
            type: 'shooting',
            shootingMakes: shootingMakes || 0,
            completedAt
          }
        });
      }
    } else {
      // Pickup or custom - just create
      await req.prisma.actualActivity.create({
        data: {
          trainingDayId: trainingDay.id,
          type,
          completedAt
        }
      });
    }

    // Fetch updated training day
    const updated = await req.prisma.trainingDay.findUnique({
      where: { id: trainingDay.id },
      include: {
        plannedActivities: true,
        actualActivities: true
      }
    });

    res.json(formatTrainingDayResponse(updated));
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/training/:date/actual/:activityId
 * Update an actual activity (e.g., shooting makes)
 */
router.put('/:date/actual/:activityId', async (req, res, next) => {
  try {
    const { activityId } = req.params;
    const { completedAt, shootingMakes } = req.body;

    // Verify ownership
    const activity = await req.prisma.actualActivity.findUnique({
      where: { id: activityId },
      include: {
        trainingDay: true
      }
    });

    if (!activity || activity.trainingDay.userId !== req.user.userId) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    const updated = await req.prisma.actualActivity.update({
      where: { id: activityId },
      data: {
        completedAt: completedAt ?? activity.completedAt,
        shootingMakes: shootingMakes ?? activity.shootingMakes
      }
    });

    // Fetch updated training day
    const trainingDay = await req.prisma.trainingDay.findUnique({
      where: { id: activity.trainingDayId },
      include: {
        plannedActivities: true,
        actualActivities: true
      }
    });

    res.json(formatTrainingDayResponse(trainingDay));
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/training/:date/shooting
 * Quick endpoint to update shooting makes
 */
router.put('/:date/shooting', async (req, res, next) => {
  try {
    const { date } = req.params;
    const { makes, completedAt } = req.body;

    if (typeof makes !== 'number') {
      return res.status(400).json({ error: 'makes must be a number' });
    }

    const trainingDay = await getOrCreateTrainingDay(req.prisma, req.user.userId, date);

    // Find or create shooting activity
    let shootingActivity = await req.prisma.actualActivity.findFirst({
      where: {
        trainingDayId: trainingDay.id,
        type: 'shooting'
      }
    });

    // Auto-set completion time when reaching 200
    let newCompletedAt = completedAt;
    if (makes >= 200 && !shootingActivity?.completedAt && !completedAt) {
      newCompletedAt = new Date().toTimeString().slice(0, 5);
    }

    if (shootingActivity) {
      await req.prisma.actualActivity.update({
        where: { id: shootingActivity.id },
        data: {
          shootingMakes: makes,
          completedAt: newCompletedAt ?? shootingActivity.completedAt
        }
      });
    } else {
      await req.prisma.actualActivity.create({
        data: {
          trainingDayId: trainingDay.id,
          type: 'shooting',
          shootingMakes: makes,
          completedAt: newCompletedAt
        }
      });
    }

    // Fetch updated training day
    const updated = await req.prisma.trainingDay.findUnique({
      where: { id: trainingDay.id },
      include: {
        plannedActivities: true,
        actualActivities: true
      }
    });

    res.json(formatTrainingDayResponse(updated));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
