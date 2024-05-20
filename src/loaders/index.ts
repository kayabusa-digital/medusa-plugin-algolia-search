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
	} catch (err) {
		// ignore
		logger.warn(err)
	}
}
