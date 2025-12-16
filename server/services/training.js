/**
 * Get or create a training day for a user
 */
async function getOrCreateTrainingDay(prisma, userId, date) {
  const dateObj = new Date(date + 'T00:00:00.000Z');

  let trainingDay = await prisma.trainingDay.findUnique({
    where: {
      userId_date: {
        userId,
        date: dateObj
      }
    },
    include: {
      plannedActivities: true,
      actualActivities: true
    }
  });

  if (!trainingDay) {
    trainingDay = await prisma.trainingDay.create({
      data: {
        userId,
        date: dateObj,
        isGameDay: false
      },
      include: {
        plannedActivities: true,
        actualActivities: true
      }
    });
  }

  return trainingDay;
}

/**
 * Format training day data for API response
 */
function formatTrainingDayResponse(trainingDay) {
  const date = trainingDay.date.toISOString().split('T')[0];

  // Group planned activities
  const planned = {
    shooting: null,
    pickupRuns: [],
    custom: []
  };

  trainingDay.plannedActivities.forEach(activity => {
    if (activity.type === 'shooting') {
      planned.shooting = {
        id: activity.id,
        time: activity.plannedTime
      };
    } else if (activity.type === 'pickup') {
      planned.pickupRuns.push({
        id: activity.id,
        time: activity.plannedTime,
        location: activity.location
      });
    } else if (activity.type === 'custom') {
      planned.custom.push({
        id: activity.id,
        time: activity.plannedTime,
        name: activity.name
      });
    }
  });

  // Group actual activities
  const actual = {
    shootingMakes: 0,
    shootingCompletedAt: null,
    coachSkills: false,
    coachWeights: false,
    varsity: false,
    pickupRuns: [],
    custom: []
  };

  trainingDay.actualActivities.forEach(activity => {
    switch (activity.type) {
      case 'shooting':
        actual.shootingMakes = activity.shootingMakes || 0;
        actual.shootingCompletedAt = activity.completedAt;
        break;
      case 'coach_skills':
        actual.coachSkills = true;
        break;
      case 'coach_weights':
        actual.coachWeights = true;
        break;
      case 'varsity':
        actual.varsity = true;
        break;
      case 'pickup':
        actual.pickupRuns.push({
          id: activity.id,
          completedAt: activity.completedAt
        });
        break;
      case 'custom':
        actual.custom.push({
          id: activity.id,
          completedAt: activity.completedAt
        });
        break;
    }
  });

  return {
    id: trainingDay.id,
    date,
    isGameDay: trainingDay.isGameDay,
    planned,
    actual
  };
}

/**
 * Calculate streak for a user
 */
async function calculateStreak(prisma, userId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let streak = 0;
  let currentDate = new Date(today);

  while (true) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const trainingDay = await prisma.trainingDay.findUnique({
      where: {
        userId_date: {
          userId,
          date: new Date(dateStr + 'T00:00:00.000Z')
        }
      },
      include: {
        actualActivities: {
          where: { type: 'shooting' }
        }
      }
    });

    const shootingActivity = trainingDay?.actualActivities?.[0];
    const makes = shootingActivity?.shootingMakes || 0;

    if (makes >= 200) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else if (streak > 0 || currentDate < today) {
      // If we've started counting and hit a gap, or we're looking at past days
      break;
    } else {
      // Today hasn't hit 200 yet, check yesterday
      currentDate.setDate(currentDate.getDate() - 1);
    }

    // Safety limit
    if (streak > 365) break;
  }

  return streak;
}

module.exports = {
  getOrCreateTrainingDay,
  formatTrainingDayResponse,
  calculateStreak
};
