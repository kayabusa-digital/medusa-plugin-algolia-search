import { MedusaContainer } from '@medusajs/modules-sdk'
import { Logger } from '@medusajs/types'
import AlgoliaService from '../services/algolia'
import { AlgoliaPluginOptions } from '../types'

export default async (
	container: MedusaContainer,
	options: AlgoliaPluginOptions
) => {
	const logger: Logger = container.resolve('logger')
	try {
		const algoliaService: AlgoliaService =
			container.resolve('algoliaService')

		const { settings } = options

		await Promise.all(
			Object.entries(settings || {}).map(async ([indexType]) => {
				return await algoliaService.updateSettings(indexType)
			})
		)

		await registerSheduledJob(container, options)
	} catch (err) {
		// ignore
		logger.warn(err)
	}
}

async function handleRefreshJob(container: MedusaContainer) {
	const logger: Logger = container.resolve('logger')
	try {
		const eventBusService = container.resolve('eventBusService')
		void eventBusService
			.emit('SEARCH_INDEX_EVENT', {})
			.catch((err: Error) => {
				logger.error(err)
				logger.error(
					'Something went wrong while emitting the search indexing event.'
				)
			})
	} catch (err) {
		logger.warn(err)
	}
}

async function registerSheduledJob(
	container: MedusaContainer,
	options: AlgoliaPluginOptions
) {
	const logger_ = container.resolve('logger')
	const scheduler_ = container.resolve('jobSchedulerService')
	const { scheduledRefresh } = options

	if (scheduledRefresh != null) {
		if (scheduler_ == null) {
			logger_.warn(
				'Scheduler not found, can not register refresh index job'
			)
			return
		}
		await scheduler_.create(
			'refresh-algolia-indexes',
			{},
			scheduledRefresh as string,
			() => handleRefreshJob(container),
			{
				keepExisting: false,
			}
		)
		logger_.info('Refresh index job sheduled successfully')
	}
}
