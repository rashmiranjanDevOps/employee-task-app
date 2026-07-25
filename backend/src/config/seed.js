'use strict';

require('dotenv').config();
const { sequelize } = require('./database');
const { User, Task } = require('../models');
const logger = require('../utils/logger');

async function seed() {
  try {
    // Guard against an accidental `npm run seed` against production. This
    // script is not called by any Jenkins stage or scripts/*.sh today (it's
    // a manual local/dev convenience only), but the two accounts it creates
    // use fixed, publicly-visible-in-this-file passwords, so the safest
    // fix is to make it refuse to run at all if NODE_ENV=production rather
    // than rely on nobody ever wiring it into an automated path later.
    if (process.env.NODE_ENV === 'production') {
      logger.error('Refusing to run seed.js with NODE_ENV=production. This script creates accounts with hardcoded demo passwords and must never run against a production database.');
      process.exit(1);
    }

    logger.info('Starting database seed...');
    await sequelize.authenticate();

    // NOTE: passwords are passed as plaintext here. The User model's
    // beforeCreate hook hashes `password` automatically on creation.
    // Hashing it again here would double-hash it and break login.
    const adminPassword = 'Admin@123456';
    const userPassword = 'User@123456';

    const [admin] = await User.findOrCreate({
      where: { email: 'admin@rashmidevops.xyz' },
      defaults: {
        firstName: 'System',
        lastName: 'Admin',
        email: 'admin@rashmidevops.xyz',
        password: adminPassword,
        role: 'admin',
        isActive: true,
        department: 'Engineering',
        jobTitle: 'System Administrator',
      },
    });

    const [user1] = await User.findOrCreate({
      where: { email: 'alice@rashmidevops.xyz' },
      defaults: {
        firstName: 'Alice',
        lastName: 'Johnson',
        email: 'alice@rashmidevops.xyz',
        password: userPassword,
        role: 'user',
        isActive: true,
        department: 'Engineering',
        jobTitle: 'Software Engineer',
      },
    });

    const [user2] = await User.findOrCreate({
      where: { email: 'bob@rashmidevops.xyz' },
      defaults: {
        firstName: 'Bob',
        lastName: 'Smith',
        email: 'bob@rashmidevops.xyz',
        password: userPassword,
        role: 'user',
        isActive: true,
        department: 'Product',
        jobTitle: 'Product Manager',
      },
    });

    const tasks = [
      {
        title: 'Setup CI/CD Pipeline',
        description: 'Configure Jenkins pipeline with SonarQube, Trivy, and ArgoCD integration.',
        status: 'in_progress',
        priority: 'high',
        assignedTo: user1.id,
        createdBy: admin.id,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        tags: ['devops', 'ci/cd'],
      },
      {
        title: 'Implement Authentication Module',
        description: 'Build JWT-based authentication with refresh tokens and RBAC.',
        status: 'completed',
        priority: 'critical',
        assignedTo: user1.id,
        createdBy: admin.id,
        dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        completedAt: new Date(),
        tags: ['backend', 'security'],
      },
      {
        title: 'Design System Documentation',
        description: 'Document all UI components and design tokens for the frontend team.',
        status: 'todo',
        priority: 'medium',
        assignedTo: user2.id,
        createdBy: admin.id,
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        tags: ['frontend', 'documentation'],
      },
      {
        title: 'Performance Testing',
        description: 'Run k6 load tests and identify bottlenecks in the API.',
        status: 'todo',
        priority: 'medium',
        assignedTo: user2.id,
        createdBy: user1.id,
        dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        tags: ['testing', 'performance'],
      },
    ];

    for (const task of tasks) {
      await Task.findOrCreate({ where: { title: task.title }, defaults: task });
    }

    logger.info('Database seeded successfully');
    logger.info('Seed complete. Admin: admin@rashmidevops.xyz — retrieve password from seed source.');
    logger.info('Seed complete. Users: alice@rashmidevops.xyz, bob@rashmidevops.xyz — retrieve passwords from seed source.');
    process.exit(0);
  } catch (err) {
    logger.error({ msg: 'Seed failed', error: err.message, stack: err.stack });
    process.exit(1);
  }
}

seed();
