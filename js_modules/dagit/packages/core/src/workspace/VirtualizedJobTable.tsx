import {gql, useLazyQuery} from '@apollo/client';
import {Box, Caption, Colors, Tag} from '@dagster-io/ui';
import {useVirtualizer} from '@tanstack/react-virtual';
import * as React from 'react';
import styled from 'styled-components/macro';

import {JobMenu} from '../instance/JobMenu';
import {LastRunSummary} from '../instance/LastRunSummary';
import {ScheduleOrSensorTag} from '../nav/ScheduleOrSensorTag';
import {RepoSectionHeader} from '../runs/RepoSectionHeader';
import {RunStatusPezList} from '../runs/RunStatusPez';
import {RUN_TIME_FRAGMENT} from '../runs/RunUtils';
import {SCHEDULE_SWITCH_FRAGMENT} from '../schedules/ScheduleSwitch';
import {SENSOR_SWITCH_FRAGMENT} from '../sensors/SensorSwitch';
import {useRepoExpansionState} from '../ui/useRepoExpansionState';

import {buildPipelineSelector} from './WorkspaceContext';
import {repoAddressAsString} from './repoAddressAsString';
import {RepoAddress} from './types';
import {SingleJobQuery, SingleJobQueryVariables} from './types/SingleJobQuery';
import {workspacePathFromAddress} from './workspacePath';

type Repository = {
  repoAddress: RepoAddress;
  jobs: {
    isJob: boolean;
    name: string;
  }[];
};

interface Props {
  repos: Repository[];
}

type RowType =
  | {type: 'header'; repoAddress: RepoAddress; jobCount: number}
  | {type: 'job'; repoAddress: RepoAddress; isJob: boolean; name: string};

const JOBS_EXPANSION_STATE_STORAGE_KEY = 'jobs-virtualized-expansion-state';

export const VirtualizedJobTable: React.FC<Props> = ({repos}) => {
  const parentRef = React.useRef<HTMLDivElement | null>(null);
  const {expandedKeys, onToggle} = useRepoExpansionState(JOBS_EXPANSION_STATE_STORAGE_KEY);

  const flattened: RowType[] = React.useMemo(() => {
    const flat: RowType[] = [];
    repos.forEach(({repoAddress, jobs}) => {
      flat.push({type: 'header', repoAddress, jobCount: jobs.length});
      const repoKey = repoAddressAsString(repoAddress);
      if (expandedKeys.includes(repoKey)) {
        jobs.forEach(({isJob, name}) => {
          flat.push({type: 'job', repoAddress, isJob, name});
        });
      }
    });
    return flat;
  }, [repos, expandedKeys]);

  const rowVirtualizer = useVirtualizer({
    count: flattened.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (ii: number) => {
      const row = flattened[ii];
      return row?.type === 'header' ? 32 : 64;
    },
    overscan: 10,
  });

  const totalHeight = rowVirtualizer.getTotalSize();
  const items = rowVirtualizer.getVirtualItems();

  return (
    <Container ref={parentRef}>
      <Inner $totalHeight={totalHeight}>
        {items.map(({index, key, size, start}) => {
          const row: RowType = flattened[index];
          const type = row!.type;
          return type === 'header' ? (
            <RepoRow
              repoAddress={row.repoAddress}
              jobCount={row.jobCount}
              key={key}
              height={size}
              start={start}
              onToggle={onToggle}
            />
          ) : (
            <JobRow
              key={key}
              name={row.name}
              isJob={row.isJob}
              repoAddress={row.repoAddress}
              height={size}
              start={start}
            />
          );
        })}
      </Inner>
    </Container>
  );
};

const RepoRow: React.FC<{
  repoAddress: RepoAddress;
  jobCount: number;
  height: number;
  start: number;
  onToggle: (repoAddress: RepoAddress) => void;
}> = ({repoAddress, jobCount, height, start, onToggle}) => {
  return (
    <Row $height={height} $start={start}>
      <RepoSectionHeader
        repoName={repoAddress.name}
        repoLocation={repoAddress.location}
        expanded
        onClick={() => onToggle(repoAddress)}
        showLocation={false}
        rightElement={<Tag intent="primary">{jobCount}</Tag>}
      />
    </Row>
  );
};

const JOB_QUERY_DELAY = 300;

interface JobRowProps {
  name: string;
  isJob: boolean;
  repoAddress: RepoAddress;
  height: number;
  start: number;
}

const JobRow = (props: JobRowProps) => {
  const {name, isJob, repoAddress, start, height} = props;

  const [queryJob, {data, loading}] = useLazyQuery<SingleJobQuery, SingleJobQueryVariables>(
    SINGLE_JOB_QUERY,
    {
      fetchPolicy: 'cache-and-network',
      variables: {
        selector: buildPipelineSelector(repoAddress, name),
      },
    },
  );

  React.useEffect(() => {
    const timer = setTimeout(() => {
      queryJob();
    }, JOB_QUERY_DELAY);

    return () => clearTimeout(timer);
  }, [queryJob, name]);

  const {schedules, sensors} = React.useMemo(() => {
    if (data?.pipelineOrError.__typename === 'Pipeline') {
      const {schedules, sensors} = data.pipelineOrError;
      return {schedules, sensors};
    }
    return {schedules: [], sensors: []};
  }, [data]);

  const latestRuns = React.useMemo(() => {
    if (data?.pipelineOrError.__typename === 'Pipeline') {
      const runs = data.pipelineOrError.runs;
      if (runs.length) {
        return [...runs];
      }
    }
    return [];
  }, [data]);

  return (
    <Row $height={height} $start={start}>
      <RowGrid border={{side: 'bottom', width: 1, color: Colors.KeylineGray}}>
        <RowCell>
          <div style={{whiteSpace: 'nowrap'}}>
            <a href={workspacePathFromAddress(repoAddress, `/jobs/${name}`)}>{name}</a>
          </div>
          <div
            style={{
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            <Caption
              style={{
                color: Colors.Gray500,
                whiteSpace: 'nowrap',
              }}
            >
              {data?.pipelineOrError.__typename === 'Pipeline'
                ? data.pipelineOrError.description
                : ''}
            </Caption>
          </div>
        </RowCell>
        <RowCell>
          {schedules.length || sensors.length ? (
            <Box flex={{direction: 'column', alignItems: 'flex-start', gap: 8}}>
              <ScheduleOrSensorTag
                schedules={schedules}
                sensors={sensors}
                repoAddress={repoAddress}
              />
              {/* {schedules.length ? <NextTick schedules={schedules} /> : null} */}
            </Box>
          ) : (
            <div style={{color: Colors.Gray500}}>{loading && !data ? 'Loading' : 'None'}</div>
          )}
        </RowCell>
        <RowCell>
          {latestRuns.length ? (
            <LastRunSummary run={latestRuns[0]} showButton={false} showHover name={name} />
          ) : (
            <div style={{color: Colors.Gray500}}>{loading && !data ? 'Loading' : 'None'}</div>
          )}
        </RowCell>
        <RowCell>
          {latestRuns.length ? (
            <RunStatusPezList jobName={name} runs={[...latestRuns].reverse()} fade />
          ) : (
            <div style={{color: Colors.Gray500}}>{loading && !data ? 'Loading' : 'None'}</div>
          )}
        </RowCell>
        <RowCell>
          <div>
            <JobMenu job={{isJob, name, runs: latestRuns}} repoAddress={repoAddress} />
          </div>
        </RowCell>
      </RowGrid>
    </Row>
  );
};

const RowCell: React.FC = ({children}) => (
  <Box
    padding={{horizontal: 24}}
    flex={{direction: 'column', justifyContent: 'center'}}
    style={{color: Colors.Gray500, overflow: 'hidden'}}
    border={{side: 'right', width: 1, color: Colors.KeylineGray}}
  >
    {children}
  </Box>
);

const Container = styled.div`
  height: 100%;
  overflow: auto;
`;

type InnerProps = {
  $totalHeight: number;
};

const Inner = styled.div.attrs<InnerProps>(({$totalHeight}) => ({
  style: {
    height: `${$totalHeight}px`,
  },
}))<InnerProps>`
  position: relative;
  width: 100%;
`;

type RowProps = {$height: number; $start: number};

const Row = styled.div.attrs<RowProps>(({$height, $start}) => ({
  style: {
    height: `${$height}px`,
    transform: `translateY(${$start}px)`,
  },
}))<RowProps>`
  left: 0;
  position: absolute;
  right: 0;
  top: 0;
  overflow: hidden;
`;

const RowGrid = styled(Box)`
  display: grid;
  grid-template-columns: 34% 30% 20% 8% 8%;
  height: 100%;
`;

const SINGLE_JOB_QUERY = gql`
  query SingleJobQuery($selector: PipelineSelector!) {
    pipelineOrError(params: $selector) {
      ... on Pipeline {
        id
        name
        isJob
        description
        runs(limit: 5) {
          id
          ...RunTimeFragment
        }
        schedules {
          id
          ...ScheduleSwitchFragment
        }
        sensors {
          id
          ...SensorSwitchFragment
        }
      }
    }
  }

  ${RUN_TIME_FRAGMENT}
  ${SCHEDULE_SWITCH_FRAGMENT}
  ${SENSOR_SWITCH_FRAGMENT}
`;
