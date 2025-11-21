const { PrismaClient } = require('@prisma/client');


const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    errorFormat: 'minimal', 
});


prisma.$connect()
    .then(() => {
    })
    .catch((err) => {
        console.error("Prisma Client failed to connect to DB:", err);
    });


module.exports = { prisma };