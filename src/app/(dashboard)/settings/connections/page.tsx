'use client';

import { useState } from 'react';
import { ConnectionForm } from '@/components/connections/connection-form';
import { ConnectionList } from '@/components/connections/connection-list';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { ConnectionResponse } from '@/lib/queries/connections';

export default function ConnectionsPage() {
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editingConnection, setEditingConnection] = useState<ConnectionResponse | null>(null);

	const handleAdd = () => {
		setEditingConnection(null);
		setDialogOpen(true);
	};

	const handleEdit = (connection: ConnectionResponse) => {
		setEditingConnection(connection);
		setDialogOpen(true);
	};

	const handleClose = () => {
		setDialogOpen(false);
		setEditingConnection(null);
	};

	return (
		<div className='space-y-6'>
			<h1 className='text-2xl font-bold'>Connection Settings</h1>
			<ConnectionList onAdd={handleAdd} onEdit={handleEdit} />

			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent className='sm:max-w-md p-0 overflow-hidden'>
					<DialogHeader className='sr-only'>
						<DialogTitle>{editingConnection ? 'Edit Connection' : 'Add Connection'}</DialogTitle>
					</DialogHeader>
					<ConnectionForm connection={editingConnection || undefined} onSuccess={handleClose} onCancel={handleClose} />
				</DialogContent>
			</Dialog>
		</div>
	);
}
