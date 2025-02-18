/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component } from 'react';
import { ContentPanel } from '../../../../../../components/ContentPanel';
import {
  EuiComboBox,
  EuiComboBoxOptionOption,
  EuiFormRow,
  EuiSpacer,
  EuiCallOut,
  EuiTextColor,
} from '@elastic/eui';
import { FormFieldHeader } from '../../../../../../components/FormFieldHeader/FormFieldHeader';
import { IndexOption } from '../../../../../Detectors/models/interfaces';
import { MIN_NUM_DATA_SOURCES } from '../../../../../Detectors/utils/constants';
import IndexService from '../../../../../../services/IndexService';
import { NotificationsStart } from 'opensearch-dashboards/public';
import { errorNotificationToast } from '../../../../../../utils/helpers';
import _ from 'lodash';
import { FieldMappingService } from '../../../../../../services';

interface DetectorDataSourceProps {
  detectorIndices: string[];
  indexService: IndexService;
  fieldMappingService?: FieldMappingService;
  isEdit: boolean;
  onDetectorInputIndicesChange: (selectedOptions: EuiComboBoxOptionOption<string>[]) => void;
  notifications: NotificationsStart;
  detector_type: string;
}

interface DetectorDataSourceState {
  loading: boolean;
  fieldTouched: boolean;
  indexOptions: IndexOption[];
  errorMessage?: string;
  differentLogTypesDetected: boolean;
}

export default class DetectorDataSource extends Component<
  DetectorDataSourceProps,
  DetectorDataSourceState
> {
  private indicesMappings: any = {};

  constructor(props: DetectorDataSourceProps) {
    super(props);
    this.state = {
      loading: true,
      fieldTouched: props.isEdit,
      indexOptions: [],
      differentLogTypesDetected: false,
    };
  }

  componentDidMount = async () => {
    this.getIndices();
  };

  getIndices = async () => {
    this.setState({ loading: true });
    try {
      const indicesResponse = await this.props.indexService.getIndices();
      if (indicesResponse.ok) {
        const indices = indicesResponse.response.indices;
        const indicesNames = indices.map((index) => index.index);

        this.setState({
          loading: false,
          indexOptions: this.parseOptions(indicesNames),
        });
      } else {
        errorNotificationToast(
          this.props.notifications,
          'retrieve',
          'indices',
          indicesResponse.error
        );
        this.setState({ errorMessage: indicesResponse.error });
      }
    } catch (error: any) {
      errorNotificationToast(this.props.notifications, 'retrieve', 'indices', error);
    }
    this.setState({ loading: false });
  };

  parseOptions = (indices: string[]) => {
    return indices.map((index) => ({ label: index }));
  };

  onCreateOption = (searchValue: string, options: EuiComboBoxOptionOption[]) => {
    const parsedOptions = this.parseOptions(this.props.detectorIndices);
    parsedOptions.push({ label: searchValue });
    this.onSelectionChange(parsedOptions);
  };

  onSelectionChange = async (options: EuiComboBoxOptionOption<string>[]) => {
    const allIndices = _.map(options, 'label');
    for (let indexName in this.indicesMappings) {
      if (allIndices.indexOf(indexName) === -1) {
        // cleanup removed indexes
        delete this.indicesMappings[indexName];
      }
    }

    for (const indexName of allIndices) {
      if (!this.indicesMappings[indexName]) {
        const detectorType = this.props.detector_type.toLowerCase();
        const result = await this.props.fieldMappingService?.getMappingsView(
          indexName,
          detectorType
        );
        result?.ok && (this.indicesMappings[indexName] = result.response.unmapped_field_aliases);
      }
    }

    if (!_.isEmpty(this.indicesMappings)) {
      let firstMapping: string[] = [];
      let firstMatchMappingIndex: string = '';
      let differentLogTypesDetected = false;
      for (let indexName in this.indicesMappings) {
        if (this.indicesMappings.hasOwnProperty(indexName)) {
          if (!firstMapping.length) firstMapping = this.indicesMappings[indexName];
          !firstMatchMappingIndex.length && (firstMatchMappingIndex = indexName);
          if (!_.isEqual(firstMapping, this.indicesMappings[indexName])) {
            differentLogTypesDetected = true;
            break;
          }
        }
      }

      this.setState({ differentLogTypesDetected });
    }

    this.props.onDetectorInputIndicesChange(options);
  };

  render() {
    const { detectorIndices } = this.props;
    const {
      loading,
      fieldTouched,
      indexOptions,
      errorMessage,
      differentLogTypesDetected,
    } = this.state;
    const isInvalid = fieldTouched && detectorIndices.length < MIN_NUM_DATA_SOURCES;
    return (
      <ContentPanel title={'Data source'} titleSize={'m'}>
        <EuiSpacer size={'m'} />
        <EuiFormRow
          label={
            <FormFieldHeader headerTitle={'Select or input source indexes or index patterns'} />
          }
          isInvalid={isInvalid}
          error={isInvalid && (errorMessage || 'Select an input source.')}
        >
          <EuiComboBox
            placeholder={'Select an input source for the detector.'}
            isLoading={loading}
            options={indexOptions}
            selectedOptions={this.parseOptions(detectorIndices)}
            onBlur={() => this.setState({ fieldTouched: true })}
            onChange={this.onSelectionChange}
            onCreateOption={this.onCreateOption}
            isInvalid={!!errorMessage}
            isClearable={true}
            data-test-subj={'define-detector-select-data-source'}
          />
        </EuiFormRow>
        {differentLogTypesDetected ? (
          <>
            <EuiSpacer size={'m'} />
            <EuiCallOut
              title="The selected log sources contain different log types"
              color="warning"
              data-test-subj={'define-detector-diff-log-types-warning'}
            >
              <EuiTextColor color={'default'}>
                To avoid issues with field mappings, we recommend creating separate detectors for
                different log types.
              </EuiTextColor>
            </EuiCallOut>
          </>
        ) : null}
      </ContentPanel>
    );
  }
}
