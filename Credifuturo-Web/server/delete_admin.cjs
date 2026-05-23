const { Client } = require('./models');

async function deleteAdmin() {
    try {
        const deletedCount = await Client.destroy({
            where: { cedula: '0000000000' }
        });
        if (deletedCount > 0) {
            console.log('Successfully deleted user: Administrador Principal (0000000000)');
        } else {
            console.log('User not found or already deleted.');
        }
    } catch (e) {
        console.error('Error deleting user:', e);
    }
}

deleteAdmin();
