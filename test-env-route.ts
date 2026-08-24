// Just test if env is visible
console.log('DATABASE_URL starts with:', process.env.DATABASE_URL?.slice(0, 15) ?? 'UNDEFINED')
